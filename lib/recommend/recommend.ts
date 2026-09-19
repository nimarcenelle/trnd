import type { Repo } from "@/lib/db/repo";
import type { Business, NewOpportunity, NewSignal, NewSignalReading, Signal } from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { isModelConfigured } from "@/lib/env";
import { applyRelevance, scoreOpportunity, tokens, type ScoredOpportunity } from "@/lib/scoring";
import { dedupeReadings, loadGradeContext } from "@/lib/scoring/gather";
import { DOESNT_FIT_NOTE, gradeOpportunity, holdForReason, storedSignalScores } from "@/lib/scoring/grade-opportunity";
import { loadBrandMemory, memoryHold } from "@/lib/record/memory";
import { businessStateGeo, localityFor, localityRegion, placeWords } from "@/lib/signals/geo";
import { normalizeTerm } from "@/lib/signals/normalize";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { verticalKey } from "@/lib/signals/vertical";

import { targetCustomerOf } from "@/lib/ai/brief";
import { withAiContext } from "@/lib/ai/usage";

import { extrasFor, loadSignalContext } from "./four-signals";
import { buildBusinessFitContext, judgeTermRelevance } from "./relevance";

import { isExpiredMoment } from "./freshness";
import { weekOf } from "./week";

export { weekOf };

const TOP_N = 5;
/** Wider pool for the relevance pass — a relevant #15 can outrank a junk #1
 * now that per-business watchlists put more genuinely-relevant terms in play. */
const CANDIDATE_POOL = 20;
/** Snapshot-anchored signals admitted past the momentum cutoff — exact
 * watch-term matches seat first, then two-token near matches. */
const ANCHOR_EXTRA = 8;

/**
 * "personal hygiene routines" and "hygiene routines" are the same trend
 * phrased twice (hashtag humanization varies day to day). Collapse terms
 * whose token sets contain one another, keeping the stronger delta.
 */
/** "drying" is "dry", "creams" is "cream", "remedies" is "remedy": one
 * idea, however the search phrased it. "air dry" and "air drying" were
 * picks one and five of the same week, same product, same volume. */
export function stemToken(t: string): string {
  if (t.length > 5 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("es") && !t.endsWith("ses")) return t.slice(0, -1);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Words that say nothing about what a term is about. */
const THEME_STOPWORDS = new Set(["for", "with", "the", "and", "near", "best", "how", "what", "why", "you", "your", "from", "into"]);

function themeTokens(normalizedTerm: string): Set<string> {
  return new Set(
    normalizedTerm
      .split("_")
      .filter((x) => x.length > 2 && !THEME_STOPWORDS.has(x))
      .map(stemToken),
  );
}

/** "filter" and "filtered", "shower" and "showerhead": one root, however
 * the search spelled it. Four letters or more, so "hard" is not "hardware". */
function sameRoot(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * The week's seats, spread over what the brand's customers talk about. Five
 * phrasings of the one product are five seats on one idea: Jolile's first
 * week was "hard water softener", "filter with shower head", "shower purifier
 * filter", and the acne, eczema and straw-hair terms its customers actually
 * search sat under them. A term that shares a root word with a seated term
 * waits; it takes a seat only if the pass ends with seats to spare. Order
 * within the result stays best-first.
 */
export function spreadTopTerms<T extends { signal: { normalized_term: string } }>(sorted: T[], seats: number): T[] {
  const seated: { entry: T; toks: Set<string> }[] = [];
  const deferred: T[] = [];
  for (const entry of sorted) {
    if (seated.length >= seats) break;
    const toks = themeTokens(entry.signal.normalized_term);
    const kin = seated.some((k) => [...toks].some((t) => [...k.toks].some((u) => sameRoot(t, u))));
    if (kin) deferred.push(entry);
    else seated.push({ entry, toks });
  }
  const out = seated.map((k) => k.entry);
  for (const entry of deferred) {
    if (out.length >= seats) break;
    out.push(entry);
  }
  return out;
}

export function dedupeByTerm<T extends { normalized_term: string; delta_pct: number | null }>(
  signals: T[],
): T[] {
  const tokens = (t: string) => new Set(t.split("_").filter((x) => x.length > 2).map(stemToken));
  const contains = (a: Set<string>, b: Set<string>) => [...b].every((x) => a.has(x));
  // Three of four words shared is the same idea in another order:
  // "microfiber towel for drying hair" and "microfiber hair towel for long
  // hair" were picks four and five, both for the same towel.
  const overlaps = (a: Set<string>, b: Set<string>) => {
    if (a.size < 3 || b.size < 3) return false;
    const shared = [...a].filter((x) => b.has(x)).length;
    return shared / Math.min(a.size, b.size) >= 0.75;
  };
  const kept: { sig: T; toks: Set<string> }[] = [];
  for (const sig of [...signals].sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))) {
    const toks = tokens(sig.normalized_term);
    if (toks.size === 0) continue;
    if (kept.some((k) => contains(k.toks, toks) || contains(toks, k.toks) || overlaps(k.toks, toks))) continue;
    kept.push({ sig, toks });
  }
  return kept.map((k) => k.sig);
}

/**
 * The judged candidate pool: the top of the raw ranking, plus signals
 * matching the given anchor texts (snapshot watch terms, menu items) admitted
 * past the momentum cutoff. The judge can only demote what it sees — never
 * promote what the cutoff dropped — so the business's own demand terms must
 * always reach it. `allScored` must be sorted best-first; the union keeps
 * that order because extras come from the sorted remainder.
 */
export function buildCandidatePool<T extends { signal: { id: string; term: string } }>(
  allScored: T[],
  anchorTexts: string[],
): T[] {
  const pool = allScored.slice(0, CANDIDATE_POOL);
  const anchors = tokens(anchorTexts.join(" "));
  if (anchors.size === 0) return pool;
  const pooled = new Set(pool.map((e) => e.signal.id));
  const extras: T[] = [];
  const take = (e: T) => {
    extras.push(e);
    pooled.add(e.signal.id);
  };
  // The business's own demand terms — watch terms, service names — get their
  // seats outright: a momentum-saturated category pool must not crowd out
  // the exact terms the analysis said to watch.
  const exact = new Set(anchorTexts.map((a) => a.toLowerCase().trim()));
  for (const e of allScored) {
    if (extras.length >= ANCHOR_EXTRA) break;
    if (!pooled.has(e.signal.id) && exact.has(e.signal.term.toLowerCase().trim())) take(e);
  }
  // Then near matches — two shared tokens minimum, so "back acne treatments"
  // can't ride in on the single word it shares with "back pain relief".
  for (const e of allScored) {
    if (extras.length >= ANCHOR_EXTRA) break;
    if (pooled.has(e.signal.id)) continue;
    const overlap = [...tokens(e.signal.term)].filter((t) => anchors.has(t)).length;
    if (overlap >= 2) take(e);
  }
  return [...pool, ...extras];
}

/** How many snapshot watch terms become evergreen candidates. */
const EVERGREEN_MAX = 6;

/**
 * Evergreen candidates: the snapshot's own demand terms, entered into the
 * ranking as steady-demand signals. On a week when no trend fits, the pick
 * becomes "run what you actually sell" — a term real customers search
 * year-round, backed by the same coverage and ad-saturation reads — instead
 * of least-bad junk from the category pool. Terms already present as a
 * scorable signal (a live trend read) are skipped; the trend wins.
 */
export function evergreenSignalInputs(
  business: Business,
  watchTerms: string[],
  existing: Pick<Signal, "normalized_term" | "metric_type">[],
): NewSignal[] {
  const present = new Set(
    existing
      .filter((s) => s.metric_type !== "news_coverage" && s.metric_type !== "ad_saturation")
      .map((s) => s.normalized_term),
  );
  return watchTerms
    .slice(0, EVERGREEN_MAX)
    .map((t) => ({ term: t.trim(), normalized: normalizeTerm(t) }))
    .filter(({ term, normalized }) => term.length > 0 && !present.has(normalized))
    .map(({ term, normalized }) => ({
      source: "snapshot" as const,
      term,
      normalized_term: normalized,
      category: business.category,
      geo: businessStateGeo(business) ?? "US",
      metric_type: "steady_demand",
      value: null,
      delta_pct: null,
      window_days: 7,
      raw: { origin: "brief_watch_term" },
    }));
}

export interface RecommendBusinessResult {
  businessId: string;
  created: number;
  topScore: number | null;
  /** The week's current opportunity ids after this run. */
  opportunityIds: string[];
  /** True when candidates were graded and every one held. Distinct from an
   * empty run held for a missing analysis: this week really has no pick,
   * so last run's picks must come down. */
  allHeld?: boolean;
}

/**
 * Score this week's signals for one business and upsert the top N as
 * opportunities. Idempotent per (business, signal, week).
 */
export async function recommendForBusiness(
  repo: Repo,
  business: Business,
): Promise<RecommendBusinessResult> {
  const signalOpts = {
    sinceDays: 14,
    // Local state signals rank alongside national ones.
    geo: businessStateGeo(business),
  };
  // category is the business's free-text identity; its own signals (watch
  // terms, snapshot, weather) are tagged with that exact string. The stock
  // market backdrop is tagged by vertical — and a niche identity ("personal
  // color analysis studio") must still borrow its broader market's backdrop,
  // so the vertical is resolved from the analysis's own vocabulary (services,
  // lexicon, watch terms), not just the identity string.
  const [services, brief] = await Promise.all([
    repo.listServices(business.id),
    repo.getBusinessBrief(business.id),
  ]);
  const vertical = verticalKey(business.category, [
    ...services.map((s) => s.name),
    ...(brief?.lexicon ?? []),
    ...(brief?.watch_terms ?? []),
  ]);
  const fetchPool = async () => {
    const own = await repo.listSignalsForCategory(business.category, signalOpts);
    if (vertical === business.category) return own;
    const backdrop = await repo.listSignalsForCategory(vertical, signalOpts);
    const seen = new Set(own.map((s) => s.id));
    return [...own, ...backdrop.filter((s) => !seen.has(s.id))];
  };
  const [firstSignals, learnings] = await Promise.all([
    fetchPool(),
    repo.listLearnings(vertical),
  ]);
  let signals = firstSignals;

  // A configured judge with no analysis yet would produce exactly the thing
  // this pipeline must never ship: an unjudged ranking wearing confident
  // grades. New businesses hold an empty week for the minute or two until
  // the analysis lands — its write re-ranks immediately. (Without the model
  // there is no judge either way; the deterministic ranking stands.)
  if (isModelConfigured && !brief) {
    const existing = await repo.listOpportunities(business.id, weekOf());
    return {
      businessId: business.id,
      created: 0,
      topScore: existing[0] ? Number(existing[0].score) : null,
      opportunityIds: existing.map((o) => o.id),
    };
  }

  // Seed this week's evergreen candidates (idempotent — the daily unique
  // index drops re-runs, and terms already live as a trend read are skipped).
  if (brief?.watch_terms?.length) {
    const evergreen = evergreenSignalInputs(business, brief.watch_terms, signals);
    if (evergreen.length > 0) {
      await repo.upsertSignals(evergreen);
      signals = await fetchPool();
    }
  }

  // News coverage is the saturation proxy; real Meta Ad Library counts beat
  // it when present. Ad reads are queried as "<term> <city>", so match on
  // the term prefix too.
  const coverage = new Map<string, number>();
  const adCounts = new Map<string, number>();
  const geoWords = placeWords(business);
  for (const s of signals) {
    if (s.metric_type === "news_coverage" && typeof s.value === "number") {
      coverage.set(s.normalized_term, s.value);
    }
    if (s.metric_type === "ad_saturation" && typeof s.value === "number") {
      // A keyword-matched sample that is mostly other industries or spam
      // says the count is noise too — competition stays unknown rather
      // than "crowded" on a motorcycle dealer's ads.
      const sample = (s.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads;
      const read = assessAdRead(sample, s.term, geoWords, s.value);
      if (read.count !== null) adCounts.set(s.normalized_term, read.count);
    }
  }
  const adCountFor = (normalizedTerm: string): number | null => {
    if (adCounts.has(normalizedTerm)) return adCounts.get(normalizedTerm)!;
    for (const [key, value] of adCounts) {
      if (key.startsWith(`${normalizedTerm}_`)) return value;
    }
    return null;
  };

  // The evidence behind the customer, competitive, cultural and brand
  // signals — loaded once, read per term.
  const signalCtx = await loadSignalContext(repo, business, brief, signals);

  const scorable = dedupeByTerm(
    signals.filter(
      (s) =>
        s.metric_type !== "news_coverage" &&
        s.metric_type !== "ad_saturation" &&
        // A moment that has already passed is not an opportunity at any
        // score. Momentum actively argues the other way — conversation about
        // a holiday peaks the week OF it, so a dying trend arrives at +100%
        // and outranks everything real. Served 2026-09-12, the top three
        // picks for a coffee shop were "labor day weekend", "labor day
        // bookings" and "labor day plans", all grade A, for a holiday that
        // ended on the 7th. Gate, not penalty: an owner asked to buy ads for
        // last weekend stops believing the other four picks too.
        !isExpiredMoment(s.term),
    ),
  );
  type Candidate = { signal: Signal; result: ScoredOpportunity; relevance: number | null };
  const allScored: Candidate[] = (
    await Promise.all(
      scorable.map(async (signal) => ({
        signal,
        result: scoreOpportunity(
          signal,
          services,
          learnings,
          {
            coverageCount: coverage.get(signal.normalized_term) ?? null,
            adCount: adCountFor(signal.normalized_term),
          },
          {
            // Demand measured in the business's own metro or state outranks
            // the same demand measured nationally.
            locality: localityFor(signal.geo, localityRegion(business)),
            // The 30-day line the owner sees is part of the momentum read.
            series: indexSeries(await repo.getSeries(signal.normalized_term, signal.geo, 30)),
            ...extrasFor(signal, signalCtx),
          },
        ),
        relevance: null,
      })),
    )
  ).sort((a, b) => b.result.score - a.result.score);
  // A modest "cold plunge" read loses to a ↑100% skincare hashtag on raw
  // score — the pool union keeps the business's own demand terms judgeable.
  let scored = buildCandidatePool(allScored, [
    ...(brief?.watch_terms ?? []),
    // The target customer's own words seat their terms in the judged pool,
    // however quiet the week's momentum on them is.
    ...(targetCustomerOf(brief)?.vocabulary ?? []),
    ...services.filter((s) => s.is_active).map((s) => s.name),
  ]);

  // Deterministic fit gate — always on, key or no key. Category matching
  // says an espresso-martini trend "fits" a BBQ smokehouse because both are
  // restaurants; the concept judge knows better, and momentum alone must
  // never carry a mismatched trend to #1. The model judge below refines
  // this read when a key is present.
  const fitCtx = buildBusinessFitContext(business, services, brief);
  scored = scored
    .map((entry) => {
      const j = judgeTermRelevance(entry.signal.term, business.category, fitCtx);
      return { ...entry, result: applyRelevance(entry.result, j.relevance, j.reason, "Fit read") };
    })
    .sort((a, b) => b.result.score - a.result.score);
  {
    // Mismatched trends drop off the list entirely — unless the whole pool
    // mismatches, in which case the least-bad few stay, honestly graded C.
    const fitOk = scored.filter((e) => e.result.components.serviceMatch >= 0.4);
    if (fitOk.length >= 2) scored = fitOk;
  }

  // Snapshot-aware relevance pass: category matching says "teeth whitening"
  // fits a contrast-therapy studio; the founding analysis knows better. One
  // Flash call re-judges the candidate pool against what the business
  // actually sells and who its customers are.
  if (isModelConfigured && scored.length > 0) {
    if (brief) {
      let judgments: Awaited<ReturnType<typeof import("@/lib/ai/openai").judgeSignalRelevance>> | null = null;
      for (let attempt = 0; attempt < 2 && !judgments; attempt++) {
        try {
          const { judgeSignalRelevance } = await import("@/lib/ai/openai");
          judgments = await judgeSignalRelevance(
            business,
            brief,
            services,
            scored.map(({ signal }) => ({ term: signal.term, metric: signal.metric_type })),
          );
        } catch (err) {
          console.warn(`[recommend] relevance pass attempt ${attempt + 1} failed:`, (err as Error).message);
        }
      }
      if (judgments) {
        const map = judgments;
        scored = scored
          .map((entry, i) => {
            const j = map.get(i);
            return j
              ? {
                  ...entry,
                  relevance: j.relevance,
                  result: applyRelevance(entry.result, j.relevance, j.reason),
                }
              : entry;
          })
          .sort((a, b) => b.result.score - a.result.score);
        // Judged-irrelevant trends don't make the list at all — unless the
        // whole pool is irrelevant, in which case the least-bad few stay,
        // honestly graded C, rather than an empty screen.
        const fitOk = scored.filter((e) => e.result.components.serviceMatch >= 0.15);
        if (fitOk.length >= 2) scored = fitOk;
      } else {
        // With a snapshot on file, an UNJUDGED ranking must never replace a
        // judged one — hold the previous week's list instead of writing
        // confident nonsense. (With no previous list, the deterministic
        // ranking stands and the next brief-write re-ranks it.)
        const existing = await repo.listOpportunities(business.id, weekOf());
        if (existing.length > 0) {
          console.warn("[recommend] judge unavailable — keeping the existing judged ranking");
          return {
            businessId: business.id,
            created: 0,
            topScore: Number(existing[0].score),
            opportunityIds: existing.map((o) => o.id),
          };
        }
      }
    }
  }
  // The Opportunity Grade decides the order and what is stored
  // (lib/scoring/model.ts). The legacy total above built and trimmed the
  // judged pool; it no longer ranks. The judged fit rides along so the
  // grade's catalog gate uses the same read the pool was filtered on.
  const [gradeCtx, memory] = await Promise.all([
    loadGradeContext(repo, business, { brief, services, pool: signals, signals: signalCtx }),
    loadBrandMemory(repo, business),
  ]);
  const readings: NewSignalReading[] = [];
  const graded = await Promise.all(
    scored.map(async (entry) => {
      const { grade: measured, readings: taken } = await gradeOpportunity(repo, business, entry.signal, gradeCtx, {
        fit: entry.result.components.serviceMatch,
      });
      readings.push(...taken);
      // What the brand already did with this term outranks what the week
      // says about it: a term it is running, killed, or passed on is held
      // with that reason, however loud the signals are.
      const remembered = memoryHold(memory.get(entry.signal.normalized_term), gradeCtx.now);
      const grade = remembered ? holdForReason(measured, remembered.reason) : measured;
      return { ...entry, grade, remembered };
    }),
  );
  // Every graded term's readings are kept, not just the five stored: the
  // baseline is what this brand's weeks look like, not what won them.
  if (readings.length > 0) {
    try {
      await repo.upsertSignalReadings(dedupeReadings(readings));
    } catch (err) {
      console.warn("[recommend] signal readings not stored (non-fatal):", (err as Error).message);
    }
  }

  // A Hold is "don't build a campaign yet", so it never takes a seat in the
  // week's five. When every candidate holds, the week stores nothing rather
  // than dressing the least-bad Hold up as a pick.
  const top = spreadTopTerms(
    graded.filter((e) => !e.grade.hold).sort((a, b) => b.grade.score - a.grade.score || b.result.score - a.result.score),
    TOP_N,
  );

  // What the week held, and why, is the other half of the call: the pick
  // page says "not this week" from these rows.
  const week = weekOf();
  try {
    await repo.replaceWeekSkips(
      business.id,
      week,
      graded
        .filter((e) => e.grade.hold)
        .sort((a, b) => b.grade.score - a.grade.score)
        .map((e) => ({
          term: e.signal.term,
          normalized_term: e.signal.normalized_term,
          kind: e.remembered ? "memory" : e.grade.notes[0] === DOESNT_FIT_NOTE ? "fit" : "hold",
          reason: e.grade.notes[0] ?? "Held this week: not enough behind it",
          grade: e.grade.grade,
          grade_score: e.grade.score,
        })),
    );
  } catch (err) {
    console.warn("[recommend] week skips not stored (non-fatal):", (err as Error).message);
  }

  if (top.length === 0) {
    return { businessId: business.id, created: 0, topScore: null, opportunityIds: [], allHeld: graded.length > 0 };
  }

  const inputs: NewOpportunity[] = top.map(({ signal, result, relevance, grade }) => ({
    business_id: business.id,
    signal_id: signal.id,
    week_of: week,
    // The 0-10 column every existing reader knows, on the grade's scale.
    score: Math.round(grade.score * 10) / 100,
    rationale: result.rationale,
    matched_service_id: result.matchedService?.id ?? null,
    competitor_gap: result.competitorGapText,
    relevance,
    grade: grade.grade,
    grade_score: grade.score,
    signal_scores: storedSignalScores(grade),
  }));
  const rows = await repo.upsertOpportunities(inputs);

  // Rows that fell out of this ranking go. Left behind, yesterday's row
  // keeps a seat in the week with yesterday's grade, or none at all, and a
  // term the model now holds becomes a pick: the Hold gate only sees what
  // is stored. (A pick already chosen or run keeps its row through the
  // picks table, which replace_week_picks never deletes.)
  try {
    await repo.deleteOpportunitiesForWeek(
      business.id,
      week,
      rows.map((r) => r.id),
    );
  } catch (err) {
    console.warn("[recommend] stale opportunities not cleared (non-fatal):", (err as Error).message);
  }

  return {
    businessId: business.id,
    created: inputs.length,
    topScore: inputs[0].score,
    opportunityIds: rows.map((r) => r.id),
  };
}

export async function runRecommend(repo: Repo): Promise<RecommendBusinessResult[]> {
  const businesses = await repo.listAllBusinesses();
  const results: RecommendBusinessResult[] = [];
  for (const b of businesses) {
    try {
      // The week's picks are written by their own budgeted job
      // (app/api/cron/picks, twenty minutes after this one): a brand's
      // picks take one to two and a half minutes, and inside this loop they
      // would spend this run's 300 seconds on the first two brands.
      const result = await withAiContext({ businessId: b.id, purpose: "cron:rank" }, () => recommendForBusiness(repo, b));
      results.push(result);
    } catch (err) {
      console.warn(`[recommend] business ${b.id} failed:`, (err as Error).message);
      results.push({ businessId: b.id, created: 0, topScore: null, opportunityIds: [] });
    }
  }
  return results;
}
