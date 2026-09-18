import { bestTheme, historyLineage, historyOnTerm } from "@/lib/ads/history-read";
import {
  defaultConceptWriter,
  fallbackConceptWrite,
  type ConceptWriter,
  type ConceptWriterInput,
} from "@/lib/ai/concept-writer";
import type { ConceptStrategy } from "@/lib/ai/concept-writer";
import type { Repo } from "@/lib/db/repo";
import type { Business, BusinessBrief, NewPickBundle, Opportunity, Review, Service, Signal, SocialComment } from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { explainOpportunity } from "@/lib/recommend/explain";
import { campaignSignalBrief, loadSignalContext, type SignalContext } from "@/lib/recommend/four-signals";
import { loadBrandMemory, memoryLines, type BrandMemory } from "@/lib/record/memory";
import { weekOf as currentWeek } from "@/lib/recommend/week";
import type { StrategyRead } from "@/lib/research/strategist";
import { ensureWeekStrategy } from "@/lib/research/weekly";
import { isCulturalSource } from "@/lib/scoring";
import { rankScoreOf } from "@/lib/scoring/grade-opportunity";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { isOnlineBusiness, placeWords } from "@/lib/signals/geo";
import { engagementOf, postsOnTerm } from "@/lib/social/read";
import { recordProviderUsage } from "@/lib/usage/providers";

import { pickBet } from "./bet";
import { assembleBrief, conceptsOverlap, CONCEPT_VERSION, validateConceptWrite, type ConceptRules, type ConceptWrite } from "./concept";
import { buildEvaluationPlan, conceptBasis, structuralUnknowns } from "./evaluation";
import { buildEvidence, observedDay, type EvidenceFacts } from "./evidence";
import { metricLabelFor, metricLevel, pickMetric, sparklineOf } from "./metric";

/**
 * The weekly job that writes a brand's creative tests: up to three distinct
 * concepts, from the opportunities the ranking already scored.
 *
 * Numbers come from code (metric.ts, evaluation.ts), evidence from facts
 * (evidence.ts), judgment from the writer (lib/ai/concept-writer.ts), and
 * the writer's facts are checked against what is on file before anything
 * is stored (concept.ts). Concepts are written one after another so each
 * knows what the week already holds; a concept too close to an earlier one
 * is dropped and the week shows fewer.
 *
 * Runs in the cron, after a rerank, and at the end of onboarding. Never in a
 * page request: the model calls take a minute each.
 */

export const PICKS_PER_WEEK = 3;
/** How many ranked rows are tried to fill the week: a near-duplicate costs a slot. */
export const CANDIDATES_PER_WEEK = 5;
export const DEFAULT_SCRIPT_SECONDS = 20;

export interface GenerateWeekPicksOptions {
  /** The week's account read to build from; null skips the strategist. Omit to make or load it. */
  strategy?: StrategyRead | null;
  /** Defaults to this week. */
  weekOf?: string;
  /** False builds the bundles without storing them. Defaults to true. */
  write?: boolean;
  /** Pre-resolved Gemini models, so a batch run lists models once. */
  models?: { flash: string; pro: string };
  /** Replaces the default writer (Gemini, or the keyless template). */
  writer?: ConceptWriter;
  /** Write only the top N of the week: the first pick lands before the rest. */
  limit?: number;
  /** Bundles already built this week, keyed by opportunity id, reused as-is
   * instead of being written again by the model. */
  built?: NewPickBundle[];
}

export interface GenerateWeekPicksResult {
  ready: number;
  draft: number;
  /** Concepts dropped for saying what an earlier one said. */
  duplicates: number;
  /** Stored ids in rank order; empty when `write` is false. */
  pickIds: string[];
  bundles: NewPickBundle[];
}

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
  /** The week's account read, when the strategist could make one. */
  strategy: StrategyRead | null;
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
}

/**
 * The angle a concept builds: the read's angle on the concept's product
 * when there is one not already taken by an earlier concept this week,
 * else null with the whole ranked list, so the writer chooses.
 */
export function strategyFor(read: StrategyRead | null, matched: Service | null, others: ConceptWrite[]): ConceptStrategy | null {
  if (!read) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const taken = new Set(others.map((c) => norm(c.title)));
  const free = read.angles.filter((a) => !taken.has(norm(a.title)));
  const product = matched ? norm(matched.name) : null;
  const angle = product ? (free.find((a) => norm(a.product) === product || norm(a.product).includes(product) || product.includes(norm(a.product))) ?? null) : null;
  return { situation: read.situation, angle, angles: free, whitespace: read.whitespace, doNot: read.do_not };
}

/** The read's lines a brief's facts may trace to: the situation and the
 * angle's evidence are dossier quotes, so a fact taken from them is on file. */
export function strategyCorpus(strategy: ConceptStrategy | null): string[] {
  if (!strategy) return [];
  return [strategy.situation, ...(strategy.angle ? [strategy.angle.the_bet, strategy.angle.why_now, ...strategy.angle.evidence] : []), ...strategy.whitespace];
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

interface BuiltConcept {
  bundle: NewPickBundle;
  concept: ConceptWrite | null;
}

async function buildConcept(repo: Repo, input: WeekInputs, opportunity: Opportunity, others: ConceptWrite[]): Promise<BuiltConcept | null> {
  const { business, services, brief, pool, ctx, writer, memory } = input;
  const signal = await repo.getSignal(opportunity.signal_id);
  if (!signal) return null;
  const [explained, rawSeries] = await Promise.all([
    explainOpportunity(repo, business, opportunity, signal),
    repo.getSeries(signal.normalized_term, signal.geo, 30),
  ]);
  const series = indexSeries(rawSeries);
  const source = metricSource(signal, pool);
  const metric =
    source === null
      ? null
      : source.id === signal.id
        ? pickMetric({ signal, weekPct: explained.weekPct, monthPct: explained.monthPct, series })
        : pickMetric({
            signal: source,
            weekPct: source.delta_pct,
            monthPct: null,
            series: indexSeries(await repo.getSeries(source.normalized_term, source.geo, 30)),
          });
  const matched = services.find((s) => s.id === opportunity.matched_service_id) ?? explained.matchedService ?? null;
  const shortform = isCulturalSource(signal) ? signal : (ctx.shortform.find((s) => matchesTerm(s, signal)) ?? null);
  const rivals = rivalFacts(signal.term, ctx);
  const comments = commentFacts(signal.term, input.comments);
  const reviews = reviewFacts(signal.term, input.reviews);

  const evidence = buildEvidence({
    term: signal.term,
    signal,
    deltaPct: metric?.metric_delta_pct ?? null,
    online: isOnlineBusiness(business),
    audiencePhrase: explained.audiencePhrase ?? null,
    shortform,
    ...rivals,
    adLibrary: adLibraryFact(business, signal, pool),
    ownBestTheme: bestTheme(ctx.history),
    ownHistoryOnTerm: ownHistoryFact(signal.term, ctx),
    ownPost: ownPostFact(signal.term, ctx),
    ownPostsRead: ctx.ownPosts.length,
    comments,
    reviews,
  });

  const signals = campaignSignalBrief(signal, ctx);
  const strategy = strategyFor(input.strategy, matched, others);
  const termMemory = memory.get(signal.normalized_term);
  const quotes = [...(comments?.onTerm ?? []).map((c) => c.text), ...(reviews?.onTerm ?? []).map((r) => r.text)].slice(0, 6);
  const durationSec = scriptSeconds(signals.medianDurationSec);
  const writerInput: ConceptWriterInput = {
    business,
    term: signal.term,
    matchedService: matched,
    services,
    brief,
    signals,
    evidence: evidence.map((e) => ({ signal: e.signal, claim: e.claim, kind: e.kind })),
    quotes,
    memory: memoryLines(termMemory),
    otherConcepts: others.map((c) => ({ title: c.title, hypothesis: c.hypothesis })),
    durationSec,
    strategy,
  };
  const rules: ConceptRules = {
    term: signal.term,
    corpus: factCorpus(input, [...evidence.map((e) => e.claim), ...strategyCorpus(strategy)]),
    allowedPriceCents: services.filter((s) => s.is_active !== false && typeof s.price_cents === "number").map((s) => s.price_cents as number),
    forbiddenPhrases: forbiddenPhrases(business.claims_notes),
  };

  let concept: ConceptWrite | null = null;
  try {
    let draft: unknown = await writer(writerInput, rules);
    let checked = validateConceptWrite(draft, rules);
    if (!checked.ok) {
      console.warn(`[picks] "${signal.term}" rejected once (${checked.error}); asking for a fix`);
      draft = await writer({ ...writerInput, feedback: checked.error }, rules);
      checked = validateConceptWrite(draft, rules);
    }
    if (checked.ok) concept = checked.value;
    else {
      console.warn(`[picks] "${signal.term}" failed validation twice, stored as draft: ${checked.error}`);
      // A draft that never reached the page is a cost with nothing to show;
      // the meter keeps why, without the draft itself.
      recordProviderUsage({ provider: "other", operation: "concept:validation", units: 1, ok: false, note: `"${signal.term}": ${checked.error}` });
    }
  } catch (err) {
    console.warn(`[picks] "${signal.term}" writer failed, stored as draft:`, (err as Error).message);
    recordProviderUsage({ provider: "other", operation: "concept:writer", units: 1, ok: false, note: `"${signal.term}": ${(err as Error).message}` });
  }

  // A draft still needs words for its columns; the template supplies them,
  // and the draft never reaches the list.
  const words = concept ?? fallbackConceptWrite(writerInput);
  const evaluation = buildEvaluationPlan({ business, history: ctx.history, format: words.format });
  const basis = conceptBasis({
    memory: termMemory,
    historyOnTerm: ctx.history.length > 0 ? historyOnTerm(ctx.history, signal.term).ads : 0,
    ownBestTheme: Boolean(signals.ownBestTheme && signals.ownBestTheme.vsAccount >= 1.1),
  });
  const creative = assembleBrief(words, {
    evaluation,
    // The concept against the brand's own record: its last ads of this
    // shape, and how many beat the account. Read once the concept exists,
    // because the shape is the concept's, not the search term's.
    lineage: ctx.history.length > 0 ? historyLineage(ctx.history, [words.title, words.hooks.primary, words.hypothesis].join(". ")) : null,
    structuralUnknowns: structuralUnknowns({
      history: ctx.history,
      hasRecentCreative: Boolean(business.recent_creative_notes),
      hasClaimsNotes: Boolean(business.claims_notes),
      rivalAdsRead: rivals.rivalAds.length,
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
      opportunity_id: opportunity.id,
      rank: 0,
      geo: signal.geo,
      term: signal.term,
      // The keyword columns keep reading sensibly for anything that still
      // reads them (the runs list, the email): the finding is the hypothesis.
      finding: words.hypothesis,
      metric_label: metric?.metric_label ?? metricLabelFor(signal),
      metric_value: metric?.metric_value ?? metricLevel(signal),
      metric_delta_pct: metric?.metric_delta_pct ?? null,
      metric_window: metric?.metric_window ?? "30d",
      sparkline: metric?.sparkline ?? sparklineOf(series),
      ...bet,
      bet_what: `${words.title}: ${words.format}`,
      bet_kill_rule: evaluation.watch[0] ?? evaluation.comparison,
      guardrail: words.guardrail,
      grade: opportunity.grade ?? null,
      grade_score: opportunity.grade_score == null ? null : Number(opportunity.grade_score),
      signal_scores: opportunity.signal_scores ?? {},
      concept_title: words.title,
      brief: creative,
      brief_version: CONCEPT_VERSION,
      basis: basis.basis,
      priority_reason: `${words.priority_reason} ${basis.reason}`.trim(),
      status: ready ? "ready" : "draft",
    },
    evidence,
    // One script, the concept's own, so anything that reads scripts (the
    // runs list, the ad-history row a run becomes) still has one.
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

/** The week's rows that can become picks, best first, at most a week's candidates. */
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

export async function generateWeekPicks(repo: Repo, business: Business, opts: GenerateWeekPicksOptions = {}): Promise<GenerateWeekPicksResult> {
  const week = opts.weekOf ?? currentWeek();
  const want = Math.min(opts.limit ?? PICKS_PER_WEEK, PICKS_PER_WEEK);
  const opportunities = eligibleWeekOpportunities(await repo.listOpportunities(business.id, week));
  if (opportunities.length === 0) return { ready: 0, draft: 0, duplicates: 0, pickIds: [], bundles: [] };

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      console.warn("[picks] read failed (non-fatal):", (err as Error).message);
      return fallback;
    }
  };
  const [services, brief, pool, comments, reviews, documents] = await Promise.all([
    repo.listServices(business.id),
    repo.getBusinessBrief(business.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    safe(repo.listSocialComments(business.id, { sinceDays: 90 }), [] as SocialComment[]),
    safe(repo.listReviews(business.id, { competitorId: null }), [] as Review[]),
    safe(repo.listDocuments(business.id), []),
  ]);
  const [ctx, memory] = await Promise.all([loadSignalContext(repo, business, brief, pool), loadBrandMemory(repo, business)]);
  // The week's account read first: one strategist pass over the whole
  // dossier, stored on the week, so every concept below starts from the
  // same situation and builds one of its angles. Without a model, or when
  // it fails, the concepts are written as before.
  let strategy: StrategyRead | null = null;
  if (opts.strategy !== undefined) strategy = opts.strategy;
  else {
    try {
      strategy = (await ensureWeekStrategy(repo, business, { weekOf: week }))?.read ?? null;
    } catch (err) {
      console.warn(`[picks] account read failed for ${business.id} (non-fatal):`, (err as Error).message);
    }
  }
  const inputs: WeekInputs = {
    business,
    strategy,
    services,
    brief,
    pool,
    ctx,
    comments,
    reviews,
    documentFacts: documents.flatMap((d) => d.digest?.facts ?? []),
    memory,
    writer: opts.writer ?? defaultConceptWriter(opts.models),
  };

  const reuse = new Map((opts.built ?? []).map((b) => [b.pick.opportunity_id, b]));
  const kept: NewPickBundle[] = [];
  const keptConcepts: ConceptWrite[] = [];
  let duplicates = 0;
  for (const o of opportunities) {
    if (kept.filter((b) => b.pick.status === "ready").length >= want) break;
    const had = reuse.get(o.id);
    let built: BuiltConcept | null;
    if (had) built = { bundle: had, concept: conceptOf(had) };
    else {
      try {
        built = await buildConcept(repo, inputs, o, keptConcepts);
      } catch (err) {
        console.warn(`[picks] opportunity ${o.id} failed (non-fatal):`, (err as Error).message);
        built = null;
      }
    }
    if (!built) continue;
    if (built.concept && keptConcepts.some((k) => conceptsOverlap(k, built.concept as ConceptWrite))) {
      duplicates += 1;
      console.log(`[picks] "${built.concept.title}" says what an earlier concept says; dropped`);
      continue;
    }
    kept.push(built.bundle);
    if (built.concept) keptConcepts.push(built.concept);
  }
  // Ready concepts take the first ranks in grade order; drafts follow.
  const bundles = [...kept.filter((b) => b.pick.status === "ready"), ...kept.filter((b) => b.pick.status !== "ready")].map((b, i) => ({
    ...b,
    pick: { ...b.pick, rank: i + 1 },
  }));
  if (bundles.length === 0) return { ready: 0, draft: 0, duplicates, pickIds: [], bundles };

  const ready = bundles.filter((b) => b.pick.status === "ready").length;
  const pickIds = opts.write === false ? [] : await repo.replaceWeekPicks(business.id, week, bundles);
  return { ready, draft: bundles.length - ready, duplicates, pickIds, bundles };
}
