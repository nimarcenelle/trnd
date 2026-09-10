import type { Repo } from "@/lib/db/repo";
import type { Business, NewOpportunity, NewSignal, Signal } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { applyRelevance, scoreOpportunity, tokens, type ScoredOpportunity } from "@/lib/scoring";
import { localityFor } from "@/lib/signals/geo";
import { normalizeTerm } from "@/lib/signals/normalize";
import { verticalKey } from "@/lib/signals/vertical";

import { buildBusinessFitContext, judgeTermRelevance } from "./relevance";

/** Monday (UTC) of the week containing `d` — the opportunity week key. */
export function weekOf(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

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
export function dedupeByTerm<T extends { normalized_term: string; delta_pct: number | null }>(
  signals: T[],
): T[] {
  const tokens = (t: string) => new Set(t.split("_").filter((x) => x.length > 2));
  const contains = (a: Set<string>, b: Set<string>) => [...b].every((x) => a.has(x));
  const kept: { sig: T; toks: Set<string> }[] = [];
  for (const sig of [...signals].sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))) {
    const toks = tokens(sig.normalized_term);
    if (toks.size === 0) continue;
    if (kept.some((k) => contains(k.toks, toks) || contains(toks, k.toks))) continue;
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
      geo: business.region ? `US-${business.region.toUpperCase()}` : "US",
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
    geo: business.region ? `US-${business.region.toUpperCase()}` : undefined,
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
  // the analysis lands — its write re-ranks immediately. (Without Gemini
  // there is no judge either way; the deterministic ranking stands.)
  if (isGeminiConfigured && !brief) {
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
  for (const s of signals) {
    if (s.metric_type === "news_coverage" && typeof s.value === "number") {
      coverage.set(s.normalized_term, s.value);
    }
    if (s.metric_type === "ad_saturation" && typeof s.value === "number") {
      adCounts.set(s.normalized_term, s.value);
    }
  }
  const adCountFor = (normalizedTerm: string): number | null => {
    if (adCounts.has(normalizedTerm)) return adCounts.get(normalizedTerm)!;
    for (const [key, value] of adCounts) {
      if (key.startsWith(`${normalizedTerm}_`)) return value;
    }
    return null;
  };

  const scorable = dedupeByTerm(
    signals.filter((s) => s.metric_type !== "news_coverage" && s.metric_type !== "ad_saturation"),
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
            locality: localityFor(signal.geo, business.region),
            // The 30-day line the owner sees is part of the momentum read.
            series: await repo.getSeries(signal.normalized_term, signal.geo, 30),
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
  if (isGeminiConfigured && scored.length > 0) {
    if (brief) {
      let judgments: Awaited<ReturnType<typeof import("@/lib/ai/gemini").judgeSignalRelevance>> | null = null;
      for (let attempt = 0; attempt < 2 && !judgments; attempt++) {
        try {
          const { judgeSignalRelevance } = await import("@/lib/ai/gemini");
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
  scored = scored.slice(0, TOP_N);

  if (scored.length === 0) {
    return { businessId: business.id, created: 0, topScore: null, opportunityIds: [] };
  }

  const week = weekOf();
  const inputs: NewOpportunity[] = scored.map(({ signal, result, relevance }) => ({
    business_id: business.id,
    signal_id: signal.id,
    week_of: week,
    score: result.score,
    rationale: result.rationale,
    matched_service_id: result.matchedService?.id ?? null,
    competitor_gap: result.competitorGapText,
    relevance,
  }));
  const rows = await repo.upsertOpportunities(inputs);

  return {
    businessId: business.id,
    created: inputs.length,
    topScore: scored[0].result.score,
    opportunityIds: rows.map((r) => r.id),
  };
}

export async function runRecommend(repo: Repo): Promise<RecommendBusinessResult[]> {
  const businesses = await repo.listAllBusinesses();
  const results: RecommendBusinessResult[] = [];
  for (const b of businesses) {
    try {
      results.push(await recommendForBusiness(repo, b));
    } catch (err) {
      console.warn(`[recommend] business ${b.id} failed:`, (err as Error).message);
      results.push({ businessId: b.id, created: 0, topScore: null, opportunityIds: [] });
    }
  }
  return results;
}
