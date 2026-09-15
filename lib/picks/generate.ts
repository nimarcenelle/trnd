import { bestTheme, historyOnTerm } from "@/lib/ads/history-read";
import {
  defaultConceptWriter,
  fallbackConceptWrite,
  type ConceptWriter,
  type ConceptWriterInput,
} from "@/lib/ai/concept-writer";
import type { Repo } from "@/lib/db/repo";
import { CONCEPT_ANGLES, type Business, type BusinessBrief, type ConceptAngle, type NewPickBundle, type Opportunity, type PickTiming, type Review, type Service, type Signal, type SocialComment } from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { explainOpportunity } from "@/lib/recommend/explain";
import { campaignSignalBrief, loadSignalContext, type SignalContext } from "@/lib/recommend/four-signals";
import { loadBrandMemory, memoryLines, type BrandMemory } from "@/lib/record/memory";
import { weekOf as currentWeek } from "@/lib/recommend/week";
import { isCulturalSource } from "@/lib/scoring";
import { rankScoreOf } from "@/lib/scoring/grade-opportunity";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { isOnlineBusiness, placeWords } from "@/lib/signals/geo";
import { engagementOf, postsOnTerm } from "@/lib/social/read";
import { recordProviderUsage } from "@/lib/usage/providers";

import { pickBet } from "./bet";
import { assembleBrief, conceptsOverlap, CONCEPT_VERSION, validateConceptWrite, type ConceptRules, type ConceptWrite } from "./concept";
import { buildEvaluationPlan, conceptBasis, structuralUnknowns } from "./evaluation";
import { buildEvidence, LIMITS, observedDay, type EvidenceFacts, type NewEvidence } from "./evidence";
import { metricLabelFor, metricLevel, pickMetric, sparklineOf } from "./metric";

/**
 * The job that writes a brand's creative tests, by product.
 *
 * Every product the brand briefs for gets its own concepts, up to three,
 * each with a different angle. A concept is timely when this week's
 * evidence points at the product (a rising search, real comments, a rival
 * ad); it expires with the week. Otherwise it is evergreen: the ad TRND
 * would make for the product anyway, from its facts and the customer's
 * objections, and it stays until the brand acts on it.
 *
 * Writes are additive after the first. A concept the brand has read keeps
 * its id; a later pass only adds evidence to it or fills an empty slot,
 * one per product per pass, so a week fills in over days instead of being
 * rewritten in front of the owner. Monday's job replaces only the week's
 * unacted timely concepts.
 *
 * Numbers come from code, evidence from facts, judgment from the writer,
 * and the writer's facts are checked before anything is stored. Never in a
 * page request: each concept is a model call.
 */

/** Concepts per product, and the ceiling on the This week view. */
export const CONCEPTS_PER_PRODUCT = 3;
export const TIMELY_PER_WEEK = 3;
/** Products briefed for when the brand has not chosen. */
export const PRODUCTS_MAX = 5;
/** Model calls one pass may make, so a stage fits its time budget. */
export const WRITES_PER_PASS = 5;
/** Below this week-over-week move a term is context, not a trigger. */
export const TIMELY_MIN_DELTA_PCT = 15;
export const DEFAULT_SCRIPT_SECONDS = 20;
/** Legacy names some callers still read. */
export const PICKS_PER_WEEK = TIMELY_PER_WEEK;
export const CANDIDATES_PER_WEEK = 8;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The winning short-form length when one was read, inside what a paid
 * placement will actually hold. */
function scriptSeconds(medianSec: number | null): number {
  return typeof medianSec === "number" && medianSec > 0 ? Math.min(45, Math.max(15, Math.round(medianSec))) : DEFAULT_SCRIPT_SECONDS;
}

/** Below this, a short-form view count is too small to carry a percentage. */
const MIN_SHORTFORM_VIEWS = 5_000;

function metricSource(signal: Signal, pool: Signal[]): Signal | null {
  if (!isCulturalSource(signal)) return signal;
  const level = Number(signal.value);
  if (Number.isFinite(level) && level >= MIN_SHORTFORM_VIEWS) return signal;
  return (
    pool.find(
      (s) =>
        matchesTerm(s, signal) &&
        !isCulturalSource(s) &&
        (s.metric_type === "search_volume" || s.metric_type === "search_interest") &&
        typeof s.delta_pct === "number",
    ) ?? null
  );
}

const matchesTerm = (s: Pick<Signal, "normalized_term">, signal: Pick<Signal, "normalized_term">) =>
  s.normalized_term === signal.normalized_term || s.normalized_term.startsWith(`${signal.normalized_term}_`);

interface StoredAd {
  headline?: unknown;
  snippet?: unknown;
  url?: unknown;
  runningDays?: unknown;
}

function rivalFacts(term: string, ctx: SignalContext): Pick<EvidenceFacts, "rivalAds" | "rivalPosts" | "rivalAdsObservedOn"> {
  const names = new Map(ctx.direct.map((c) => [c.id, c.name]));
  const rivalAds: EvidenceFacts["rivalAds"] = [];
  let observed: string | null = null;
  for (const read of ctx.adReads) {
    const rival = names.get(read.competitor_id);
    if (!rival) continue;
    const stored = (read.raw as { ads?: unknown } | null)?.ads;
    const ads = (Array.isArray(stored) ? (stored as StoredAd[]) : []).map((a) => ({
      caption: [a.headline, a.snippet].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" "),
      url: typeof a.url === "string" && a.url.startsWith("https://") ? a.url : null,
      runningDays: typeof a.runningDays === "number" ? a.runningDays : null,
    }));
    // One ad per rival: two lines from the same brand read as a crowd. An ad
    // with no copy proves the rival advertises, never what it leads with.
    const onTerm = postsOnTerm(ads, term).find((a) => a.caption);
    if (onTerm) {
      rivalAds.push({ rival, text: onTerm.caption, url: onTerm.url, runningDays: onTerm.runningDays });
      observed = observed ?? observedDay((read as { captured_at?: string }).captured_at);
    }
  }
  rivalAds.sort((a, b) => (b.runningDays ?? 0) - (a.runningDays ?? 0));
  const rivalPosts = postsOnTerm(ctx.rivalPosts, term)
    .filter((p) => p.competitor_id && names.has(p.competitor_id) && p.caption.trim())
    .sort((a, b) => engagementOf(b) - engagementOf(a))
    .slice(0, 2)
    .map((p) => ({ rival: names.get(p.competitor_id as string) as string, caption: p.caption, url: p.url || null, platform: p.platform }));
  return { rivalAds, rivalPosts, rivalAdsObservedOn: observed };
}

function adLibraryFact(business: Business, signal: Signal, pool: Signal[]): EvidenceFacts["adLibrary"] {
  const read = pool.find((s) => s.metric_type === "ad_saturation" && typeof s.value === "number" && matchesTerm(s, signal));
  if (!read) return null;
  const sample = (read.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads;
  const assessed = assessAdRead(sample, read.term, placeWords(business), read.value as number);
  if (assessed.count === null) return null;
  const own = business.name.trim().toLowerCase();
  const advertisers = [
    ...new Set(
      assessed.ads
        .map((a) => (typeof a.advertiser === "string" ? a.advertiser.trim() : ""))
        .filter((a) => a && a.toLowerCase() !== own),
    ),
  ];
  return { source: read.source, term: signal.term, advertisers, count: assessed.count };
}

function ownPostFact(term: string, ctx: SignalContext): EvidenceFacts["ownPost"] {
  if (ctx.ownPosts.length < 3) return null;
  const top = postsOnTerm(ctx.ownPosts, term)
    .filter((p) => p.caption.trim())
    .sort((a, b) => engagementOf(b) - engagementOf(a))[0];
  if (!top) return null;
  const engagement = engagementOf(top);
  if (engagement <= 0 || engagement < median(ctx.ownPosts.map(engagementOf))) return null;
  return { caption: top.caption, url: top.url || null, platform: top.platform, engagement };
}

function ownHistoryFact(term: string, ctx: SignalContext): string | null {
  if (ctx.history.length === 0) return null;
  const h = historyOnTerm(ctx.history, term);
  return h.ads > 0 && /above|below|about even/.test(h.reason) ? h.reason : null;
}

/** Real comments that name the term, as written. */
function commentFacts(term: string, comments: SocialComment[]): EvidenceFacts["comments"] {
  if (comments.length === 0) return undefined;
  const onTerm = postsOnTerm(
    comments.map((c) => ({ caption: c.text, c })),
    term,
  )
    .filter(({ c }) => c.text.trim().length >= 12)
    .sort((a, b) => b.c.likes - a.c.likes)
    .slice(0, 3)
    .map(({ c }) => ({ text: c.text.trim(), postedAt: c.posted_at, where: (c.competitor_id ? "rival" : "yours") as "yours" | "rival" }));
  return { total: comments.length, onTerm };
}

/** Real reviews of the brand that name the term, as written. */
function reviewFacts(term: string, reviews: Review[]): EvidenceFacts["reviews"] {
  const own = reviews.filter((r) => !r.competitor_id && r.source !== "seed");
  if (own.length === 0) return undefined;
  const onTerm = postsOnTerm(
    own.map((r) => ({ caption: r.text, r })),
    term,
  )
    .filter(({ r }) => r.text.trim().length >= 12)
    .slice(0, 3)
    .map(({ r }) => ({ text: r.text.trim(), rating: r.rating, publishedAt: r.published_at }));
  return { total: own.length, onTerm };
}

interface WeekInputs {
  business: Business;
  services: Service[];
  brief: BusinessBrief | null;
  pool: Signal[];
  ctx: SignalContext;
  comments: SocialComment[];
  reviews: Review[];
  /** Citable facts from the owner's uploaded documents. */
  documentFacts: string[];
  memory: BrandMemory;
  writer: ConceptWriter;
  week: string;
}

/** Everything a fact in the brief may trace to. */
export function factCorpus(input: Pick<WeekInputs, "business" | "services" | "brief" | "documentFacts">, evidenceClaims: string[]): string[] {
  const { business, services, brief } = input;
  // The brand's own name and category are facts, even with an empty catalog.
  const out: string[] = [business.name, business.category];
  for (const s of services) {
    if (s.is_active === false) continue;
    out.push(s.name);
    if (s.description) out.push(s.description);
    if (typeof s.price_cents === "number" && s.price_cents > 0) out.push(`${s.name} $${(s.price_cents / 100).toFixed(2)}`);
  }
  if (business.claims_notes) out.push(business.claims_notes);
  if (business.brand_voice_notes) out.push(business.brand_voice_notes);
  if (business.recent_creative_notes) out.push(business.recent_creative_notes);
  // Briefs written by hand or by older prompts can miss a list.
  if (brief) out.push(...(brief.does_well ?? []), ...(brief.advantages ?? []), brief.moat ?? "");
  out.push(...input.documentFacts);
  out.push(...evidenceClaims);
  return out.filter((s) => typeof s === "string" && s.trim().length > 0);
}

/** Phrases the owner said never to use, from the claims notes ("never say cure"). */
export function forbiddenPhrases(claimsNotes: string | null | undefined): string[] {
  if (!claimsNotes) return [];
  const out: string[] = [];
  for (const m of claimsNotes.matchAll(/(?:never|don't|do not|can't|cannot|avoid)\s+(?:say|claim|use|mention|promise|call it|write)\s+"?([^".;\n]{3,60})"?/gi)) {
    out.push(m[1].trim());
  }
  return out;
}


/* ------------------------------- products -------------------------------- */

/** The products a brand briefs for: its own choice, else every active one,
 * the lead product first, then by price, capped. */
export function productsToBrief(business: Pick<Business, "brief_service_ids" | "priority_service_id">, services: Service[]): Service[] {
  const active = services.filter((s) => s.is_active !== false && s.name.trim().length > 0);
  const chosen = new Set(business.brief_service_ids ?? []);
  const pool = chosen.size > 0 ? active.filter((s) => chosen.has(s.id)) : active;
  const lead = business.priority_service_id ?? null;
  return [...pool]
    .sort((a, b) => Number(b.id === lead) - Number(a.id === lead) || (b.price_cents ?? 0) - (a.price_cents ?? 0) || a.name.localeCompare(b.name))
    .slice(0, chosen.size > 0 ? pool.length : PRODUCTS_MAX);
}

/** Content words of a product name, for matching a term to it. */
function productWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !/^(the|with|and|for|pack|bundle|size|set)$/.test(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/** Whether a term is about this product: it shares a content word with the name. */
export function termFitsProduct(term: string, product: Pick<Service, "name">): boolean {
  const words = productWords(product.name);
  if (words.length === 0) return false;
  const t = term.toLowerCase();
  return words.some((w) => t.includes(w));
}

/** The ranked rows that can trigger a timely concept for a product, best first. */
function triggersFor(product: Service, opportunities: Opportunity[], signals: Map<string, Signal>): Opportunity[] {
  return opportunities
    .filter((o) => {
      if (o.matched_service_id === product.id) return true;
      const sig = signals.get(o.signal_id);
      return sig ? termFitsProduct(sig.term, product) : false;
    })
    .sort((a, b) => rankScoreOf(b) - rankScoreOf(a));
}

/** Whether a trigger is strong enough to call the concept timely: the term
 * moved this week, or the ranking graded it B or better. */
export function isTimelyTrigger(o: Pick<Opportunity, "grade">, deltaPct: number | null): boolean {
  if (typeof deltaPct === "number" && Number.isFinite(deltaPct) && deltaPct >= TIMELY_MIN_DELTA_PCT) return true;
  return o.grade === "A+" || o.grade === "A" || o.grade === "B+" || o.grade === "B";
}

/** The next angle a product has not used, in the order that reads best. */
export function nextAngle(used: (ConceptAngle | null | undefined)[], timely: boolean): ConceptAngle {
  const order: ConceptAngle[] = timely
    ? ["problem_first", "objection", "demo", "comparison", "social_proof", "education"]
    : ["demo", "objection", "problem_first", "comparison", "social_proof", "education"];
  const taken = new Set(used.filter((a): a is ConceptAngle => Boolean(a)));
  return order.find((a) => !taken.has(a)) ?? CONCEPT_ANGLES[0];
}

/** Sunday of the week, when a timely concept stops showing. */
export function weekEnd(week: string): string {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/* --------------------------------- writing -------------------------------- */

export function eligibleWeekOpportunities(stored: Opportunity[]): Opportunity[] {
  const live = stored.filter((o) => o.status !== "dismissed");
  const graded = live.some((o) => o.grade);
  return live
    .filter((o) => o.grade !== "Hold" && (!graded || o.grade))
    .sort((a, b) => rankScoreOf(b) - rankScoreOf(a))
    .slice(0, CANDIDATES_PER_WEEK);
}

/** The concept a stored bundle carries, as the writer would return it. */
export function conceptOf(bundle: Pick<NewPickBundle, "pick">): ConceptWrite | null {
  const b = bundle.pick.brief;
  if (!b || !bundle.pick.concept_title) return null;
  return {
    title: bundle.pick.concept_title,
    situation: b.situation,
    hypothesis: b.hypothesis,
    unknowns: b.unknowns,
    differs_from: b.differs_from,
    format: b.format,
    hooks: b.hooks,
    script: b.script,
    shot_list: b.shot_list,
    approved_facts: b.approved_facts,
    outcomes: b.outcomes,
    priority_reason: bundle.pick.priority_reason ?? "",
    guardrail: bundle.pick.guardrail ?? null,
  };
}

interface Slot {
  product: Service;
  timing: PickTiming;
  angle: ConceptAngle;
  /** The ranked row behind a timely concept; null for evergreen. */
  trigger: Opportunity | null;
  /** What the product already has, so the writer differs from it. */
  others: ConceptWrite[];
}

interface Built {
  bundle: NewPickBundle;
  concept: ConceptWrite | null;
}

/** The evidence a product has without a weekly trigger: the customer's
 * own words on it, the brand's record with it, rivals on it, and one
 * context row that says plainly nothing is pushing it this week. */
function evergreenEvidence(product: Service, input: WeekInputs): NewEvidence[] {
  const { ctx } = input;
  const facts: EvidenceFacts = {
    term: product.name,
    signal: { source: "snapshot", term: product.name, geo: "US", raw: null, metric_type: "search_interest" },
    deltaPct: null,
    online: isOnlineBusiness(input.business),
    audiencePhrase: null,
    shortform: null,
    ...rivalFacts(product.name, ctx),
    adLibrary: null,
    ownBestTheme: bestTheme(ctx.history),
    ownHistoryOnTerm: ownHistoryFact(product.name, ctx),
    ownPost: ownPostFact(product.name, ctx),
    ownPostsRead: ctx.ownPosts.length,
    comments: commentFacts(product.name, input.comments),
    reviews: reviewFacts(product.name, input.reviews),
  };
  const rows = buildEvidence(facts);
  rows.unshift({
    signal: "brand",
    claim: `Nothing in this week's reads is pushing ${product.name}. This concept is built from the product's own facts and what customers say about it.`,
    source_url: null,
    source_label: "This week's reads",
    kind: "context",
    observed_on: input.week,
    sample_size: null,
    limitation: LIMITS.profile,
  });
  return rows;
}

async function buildSlot(repo: Repo, input: WeekInputs, slot: Slot): Promise<Built | null> {
  const { business, services, brief, pool, ctx, writer, memory, week } = input;
  const { product, timing, angle, trigger } = slot;

  // The research input: the trigger's term for a timely concept, the product itself otherwise.
  const signal = trigger ? await repo.getSignal(trigger.signal_id) : null;
  if (trigger && !signal) return null;
  const term = signal?.term ?? product.name;

  let metric: ReturnType<typeof pickMetric> | null = null;
  let sparkline: { d: string; v: number }[] = [];
  let evidence: NewEvidence[];
  let explainedAudience: string | null = null;
  if (trigger && signal) {
    const [explained, rawSeries] = await Promise.all([explainOpportunity(repo, business, trigger, signal), repo.getSeries(signal.normalized_term, signal.geo, 30)]);
    const series = indexSeries(rawSeries);
    const source = metricSource(signal, pool);
    metric =
      source === null
        ? null
        : source.id === signal.id
          ? pickMetric({ signal, weekPct: explained.weekPct, monthPct: explained.monthPct, series })
          : pickMetric({ signal: source, weekPct: source.delta_pct, monthPct: null, series: indexSeries(await repo.getSeries(source.normalized_term, source.geo, 30)) });
    sparkline = metric?.sparkline ?? sparklineOf(series);
    explainedAudience = explained.audiencePhrase ?? null;
    const shortform = isCulturalSource(signal) ? signal : (ctx.shortform.find((s) => matchesTerm(s, signal)) ?? null);
    evidence = buildEvidence({
      term: signal.term,
      signal,
      deltaPct: metric?.metric_delta_pct ?? null,
      online: isOnlineBusiness(business),
      audiencePhrase: explainedAudience,
      shortform,
      ...rivalFacts(signal.term, ctx),
      adLibrary: adLibraryFact(business, signal, pool),
      ownBestTheme: bestTheme(ctx.history),
      ownHistoryOnTerm: ownHistoryFact(signal.term, ctx),
      ownPost: ownPostFact(signal.term, ctx),
      ownPostsRead: ctx.ownPosts.length,
      comments: commentFacts(signal.term, input.comments),
      reviews: reviewFacts(signal.term, input.reviews),
    });
  } else {
    evidence = evergreenEvidence(product, input);
  }

  const signals = signal ? campaignSignalBrief(signal, ctx) : campaignSignalBrief({ ...({} as Signal), term: product.name, normalized_term: product.name.toLowerCase().replace(/\s+/g, "_"), source: "snapshot", raw: null } as Signal, ctx);
  const termMemory = memory.get(signal?.normalized_term ?? product.name.toLowerCase().replace(/\s+/g, "_"));
  const comments = commentFacts(term, input.comments);
  const reviews = reviewFacts(term, input.reviews);
  const quotes = [...(comments?.onTerm ?? []).map((c) => c.text), ...(reviews?.onTerm ?? []).map((r) => r.text)].slice(0, 6);
  const durationSec = scriptSeconds(signals.medianDurationSec);
  const writerInput: ConceptWriterInput = {
    business,
    term,
    matchedService: product,
    services,
    brief,
    signals,
    evidence: evidence.map((e) => ({ signal: e.signal, claim: e.claim, kind: e.kind })),
    quotes,
    memory: memoryLines(termMemory),
    otherConcepts: slot.others.map((c) => ({ title: c.title, hypothesis: c.hypothesis })),
    durationSec,
    angle,
    timing,
  };
  const rules: ConceptRules = {
    term,
    corpus: factCorpus(input, evidence.map((e) => e.claim)),
    allowedPriceCents: services.filter((s) => s.is_active !== false && typeof s.price_cents === "number").map((s) => s.price_cents as number),
    forbiddenPhrases: forbiddenPhrases(business.claims_notes),
  };

  let concept: ConceptWrite | null = null;
  try {
    let draft: unknown = await writer(writerInput, rules);
    let checked = validateConceptWrite(draft, rules);
    if (!checked.ok) {
      console.warn(`[picks] ${product.name} / ${angle} rejected once (${checked.error}); asking for a fix`);
      draft = await writer({ ...writerInput, feedback: checked.error }, rules);
      checked = validateConceptWrite(draft, rules);
    }
    if (checked.ok) concept = checked.value;
    else {
      console.warn(`[picks] ${product.name} / ${angle} failed validation twice, stored as draft: ${checked.error}`);
      recordProviderUsage({ provider: "other", operation: "concept:validation", units: 1, ok: false, note: `${product.name}: ${checked.error}` });
    }
  } catch (err) {
    console.warn(`[picks] ${product.name} / ${angle} writer failed, stored as draft:`, (err as Error).message);
    recordProviderUsage({ provider: "other", operation: "concept:writer", units: 1, ok: false, note: `${product.name}: ${(err as Error).message}` });
  }

  const words = concept ?? fallbackConceptWrite(writerInput);
  const evaluation = buildEvaluationPlan({ business, history: ctx.history, format: words.format });
  const basis = conceptBasis({
    memory: termMemory,
    historyOnTerm: ctx.history.length > 0 ? historyOnTerm(ctx.history, term).ads : 0,
    ownBestTheme: Boolean(signals.ownBestTheme && signals.ownBestTheme.vsAccount >= 1.1),
  });
  const creative = assembleBrief(words, {
    evaluation,
    structuralUnknowns: structuralUnknowns({
      history: ctx.history,
      hasRecentCreative: Boolean(business.recent_creative_notes),
      hasClaimsNotes: Boolean(business.claims_notes),
      rivalAdsRead: evidence.filter((e) => e.signal === "competitive").length,
      commentsRead: comments?.total ?? 0,
    }),
    differsFallback: business.recent_creative_notes
      ? "The brief did not say how this differs from what you shot recently; compare before you brief the creator."
      : "No recent creative on file to compare against. Add what you shot last in Settings and the next brief will say how it differs.",
  });
  const ready = concept !== null && evidence.length > 0;
  const bet = pickBet(business, ctx.history);

  const bundle: NewPickBundle = {
    pick: {
      opportunity_id: trigger?.id ?? null,
      rank: 0,
      geo: signal?.geo ?? "US",
      term,
      finding: words.hypothesis,
      metric_label: metric?.metric_label ?? (signal ? metricLabelFor(signal) : "No weekly signal on this product"),
      metric_value: metric?.metric_value ?? (signal ? metricLevel(signal) : null),
      metric_delta_pct: metric?.metric_delta_pct ?? null,
      metric_window: metric?.metric_window ?? "30d",
      sparkline,
      ...bet,
      bet_what: `${words.title}: ${words.format}`,
      bet_kill_rule: evaluation.watch[0] ?? evaluation.comparison,
      guardrail: words.guardrail,
      grade: trigger?.grade ?? null,
      grade_score: trigger?.grade_score == null ? null : Number(trigger.grade_score),
      signal_scores: trigger?.signal_scores ?? {},
      concept_title: words.title,
      brief: creative,
      brief_version: CONCEPT_VERSION,
      basis: basis.basis,
      priority_reason: `${words.priority_reason} ${basis.reason}`.trim(),
      service_id: product.id,
      timing,
      angle,
      expires_on: timing === "timely" ? weekEnd(week) : null,
      status: ready ? "ready" : "draft",
    },
    evidence,
    scripts: [
      {
        variant_label: "Primary",
        thesis: words.hypothesis.slice(0, 200),
        hook: words.hooks.primary,
        beats: [],
        direction: words.script.direction,
        cta: words.script.cta,
        duration_seconds: words.script.duration_seconds,
      },
    ],
  };
  return { bundle, concept };
}

export interface GenerateWeekPicksOptions {
  /** Defaults to this week. */
  weekOf?: string;
  /** False builds the bundles without storing them. Defaults to true. */
  write?: boolean;
  /** Pre-resolved Gemini models, so a batch run lists models once. */
  models?: { flash: string; pro: string };
  /** Replaces the default writer (Gemini, or the keyless template). */
  writer?: ConceptWriter;
  /** Concepts to write this pass; the first pass of a signup writes one so it lands sooner. */
  limit?: number;
  /** "replace": Monday's write, which replaces the week's unacted timely
   * concepts. "fill": add to what is open, never remove. Defaults to fill
   * when the brand already has open concepts. */
  mode?: "replace" | "fill";
  /** Bundles already built this pass, reused as-is (the first-pick hand-off). */
  built?: NewPickBundle[];
}

export interface GenerateWeekPicksResult {
  ready: number;
  draft: number;
  /** Concepts dropped for saying what an earlier one said. */
  duplicates: number;
  /** Evidence rows added to concepts that already existed. */
  evidenceAdded: number;
  /** Stored ids in the order written; empty when `write` is false. */
  pickIds: string[];
  bundles: NewPickBundle[];
}

const EMPTY: GenerateWeekPicksResult = { ready: 0, draft: 0, duplicates: 0, evidenceAdded: 0, pickIds: [], bundles: [] };

export async function generateWeekPicks(repo: Repo, business: Business, opts: GenerateWeekPicksOptions = {}): Promise<GenerateWeekPicksResult> {
  const week = opts.weekOf ?? currentWeek();
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      console.warn("[picks] read failed (non-fatal):", (err as Error).message);
      return fallback;
    }
  };
  const [services, brief, pool, comments, reviews, documents, opportunitiesAll, open] = await Promise.all([
    repo.listServices(business.id),
    repo.getBusinessBrief(business.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    safe(repo.listSocialComments(business.id, { sinceDays: 90 }), [] as SocialComment[]),
    safe(repo.listReviews(business.id, { competitorId: null }), [] as Review[]),
    safe(repo.listDocuments(business.id), []),
    repo.listOpportunities(business.id, week),
    safe(repo.listOpenPicks(business.id, week), []),
  ]);
  const products = productsToBrief(business, services);
  if (products.length === 0) return { ...EMPTY };
  const mode = opts.mode ?? (open.length > 0 ? "fill" : "replace");
  const opportunities = eligibleWeekOpportunities(opportunitiesAll);
  const signalRows = await Promise.all(opportunities.map((o) => repo.getSignal(o.signal_id)));
  const signals = new Map<string, Signal>();
  signalRows.forEach((s, i) => {
    if (s) signals.set(opportunities[i].signal_id, s);
  });

  const [ctx, memory] = await Promise.all([loadSignalContext(repo, business, brief, pool), loadBrandMemory(repo, business)]);
  const inputs: WeekInputs = {
    business,
    services,
    brief,
    pool,
    ctx,
    comments,
    reviews,
    documentFacts: documents.flatMap((d) => d.digest?.facts ?? []),
    memory,
    writer: opts.writer ?? defaultConceptWriter(opts.models),
    week,
  };

  // In replace mode the week's unacted timely concepts are about to go, so
  // they do not count as held; evergreen ones and anything acted on do.
  const kept = mode === "replace" ? open.filter((o) => (o.pick.timing ?? "timely") === "evergreen" || o.run) : open;
  const timelyThisWeek = kept.filter((o) => o.pick.timing === "timely" && o.pick.week_of === week).length;
  const reuse = new Map((opts.built ?? []).map((b) => [`${b.pick.service_id}:${b.pick.angle}`, b]));
  // A ranked row triggers one product, not every product its words fit:
  // "shower filter" reads about the filter, and the cartridge gets the ad to
  // make for it anyway rather than a second concept on the same reading.
  const claimed = new Set(kept.map((o) => o.pick.opportunity_id).filter((id): id is string => Boolean(id)));

  // The plan: one slot per product per pass, timely when a trigger points at
  // the product and the week still has room for timely concepts.
  const slots: Slot[] = [];
  let timelyRoom = TIMELY_PER_WEEK - timelyThisWeek;
  for (const product of products) {
    const have = kept.filter((o) => o.pick.service_id === product.id);
    if (have.length >= CONCEPTS_PER_PRODUCT) continue;
    const hasTimely = have.some((o) => o.pick.timing === "timely");
    const used = have.map((o) => o.pick.angle ?? null);
    const others = have.map((o) => conceptOf({ pick: o.pick })).filter((c): c is ConceptWrite => c !== null);
    let trigger: Opportunity | null = null;
    if (!hasTimely && timelyRoom > 0) {
      const candidate = triggersFor(product, opportunities, signals).find((o) => !claimed.has(o.id)) ?? null;
      const sig = candidate ? signals.get(candidate.signal_id) : null;
      if (candidate && sig && isTimelyTrigger(candidate, sig.delta_pct)) {
        trigger = candidate;
        claimed.add(candidate.id);
        timelyRoom -= 1;
      }
    }
    const timing: PickTiming = trigger ? "timely" : "evergreen";
    slots.push({ product, timing, angle: nextAngle(used, Boolean(trigger)), trigger, others });
  }

  const want = Math.min(opts.limit ?? WRITES_PER_PASS, WRITES_PER_PASS);
  const written: NewPickBundle[] = [];
  let duplicates = 0;
  let writes = 0;
  for (const slot of slots) {
    if (writes >= want) break;
    const had = reuse.get(`${slot.product.id}:${slot.angle}`);
    let built: Built | null;
    if (had) built = { bundle: had, concept: conceptOf(had) };
    else {
      writes += 1;
      try {
        built = await buildSlot(repo, inputs, slot);
      } catch (err) {
        console.warn(`[picks] ${slot.product.name} failed (non-fatal):`, (err as Error).message);
        built = null;
      }
    }
    if (!built) continue;
    if (built.concept && slot.others.some((k) => conceptsOverlap(k, built.concept as ConceptWrite))) {
      duplicates += 1;
      console.log(`[picks] "${built.concept.title}" says what ${slot.product.name} already has; dropped`);
      continue;
    }
    written.push(built.bundle);
  }

  // Evidence for concepts that already exist: the deep read may have found
  // a rival ad or a comment on a term a brand is already reading about.
  let evidenceAdded = 0;
  if (mode === "fill" && opts.write !== false) {
    for (const o of kept) {
      if (!o.pick.opportunity_id || o.pick.timing !== "timely") continue;
      const trigger = opportunitiesAll.find((x) => x.id === o.pick.opportunity_id);
      const sig = trigger ? await repo.getSignal(trigger.signal_id) : null;
      if (!trigger || !sig) continue;
      const shortform = isCulturalSource(sig) ? sig : (ctx.shortform.find((s) => matchesTerm(s, sig)) ?? null);
      const rows = buildEvidence({
        term: sig.term,
        signal: sig,
        deltaPct: o.pick.metric_delta_pct ?? null,
        online: isOnlineBusiness(business),
        audiencePhrase: null,
        shortform,
        ...rivalFacts(sig.term, ctx),
        adLibrary: adLibraryFact(business, sig, pool),
        ownBestTheme: bestTheme(ctx.history),
        ownHistoryOnTerm: ownHistoryFact(sig.term, ctx),
        ownPost: ownPostFact(sig.term, ctx),
        ownPostsRead: ctx.ownPosts.length,
        comments: commentFacts(sig.term, comments),
        reviews: reviewFacts(sig.term, reviews),
      });
      try {
        evidenceAdded += await repo.appendPickEvidence(o.pick.id, rows);
      } catch (err) {
        console.warn(`[picks] evidence for ${o.pick.id} not added (non-fatal):`, (err as Error).message);
      }
    }
  }

  // Ranks: timely first by the trigger's score, then evergreen in product order.
  const rankScore = (b: NewPickBundle) => {
    const o = opportunities.find((x) => x.id === b.pick.opportunity_id);
    return o ? rankScoreOf(o) : -1;
  };
  const ordered = [...written.filter((b) => b.pick.status === "ready"), ...written.filter((b) => b.pick.status !== "ready")]
    .sort((a, b) => Number(b.pick.timing === "timely") - Number(a.pick.timing === "timely") || rankScore(b) - rankScore(a))
    .map((b, i) => ({ ...b, pick: { ...b.pick, rank: Math.min(5, i + 1) } }));
  if (ordered.length === 0 && (mode !== "fill" || evidenceAdded === 0)) return { ...EMPTY, duplicates, evidenceAdded };

  const ready = ordered.filter((b) => b.pick.status === "ready").length;
  let pickIds: string[] = [];
  if (opts.write !== false && ordered.length > 0) {
    pickIds = mode === "replace" ? await repo.replaceWeekPicks(business.id, week, ordered) : await repo.insertWeekPicks(business.id, week, ordered);
  }
  return { ready, draft: ordered.length - ready, duplicates, evidenceAdded, pickIds, bundles: ordered };
}
