import type { Repo } from "@/lib/db/repo";
import type { Business, NewOpportunity } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { applyRelevance, scoreOpportunity } from "@/lib/scoring";

/** Monday (UTC) of the week containing `d` — the opportunity week key. */
export function weekOf(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

const TOP_N = 5;
/** Wider pool for the relevance pass — a relevant #9 can outrank a junk #1. */
const CANDIDATE_POOL = 12;

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
  const [signals, services, learnings] = await Promise.all([
    repo.listSignalsForCategory(business.category, {
      sinceDays: 14,
      // Local state signals rank alongside national ones.
      geo: business.region ? `US-${business.region.toUpperCase()}` : undefined,
    }),
    repo.listServices(business.id),
    repo.listLearnings(business.category),
  ]);

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
  let scored = scorable
    .map((signal) => ({
      signal,
      result: scoreOpportunity(signal, services, learnings, {
        coverageCount: coverage.get(signal.normalized_term) ?? null,
        adCount: adCountFor(signal.normalized_term),
      }),
    }))
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, CANDIDATE_POOL);

  // Snapshot-aware relevance pass: category matching says "teeth whitening"
  // fits a contrast-therapy studio; the founding analysis knows better. One
  // Flash call re-judges the candidate pool against what the business
  // actually sells and who its customers are.
  if (isGeminiConfigured && scored.length > 0) {
    const brief = await repo.getBusinessBrief(business.id);
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
              ? { ...entry, result: applyRelevance(entry.result, j.relevance, j.reason) }
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
  const inputs: NewOpportunity[] = scored.map(({ signal, result }) => ({
    business_id: business.id,
    signal_id: signal.id,
    week_of: week,
    score: result.score,
    rationale: result.rationale,
    matched_service_id: result.matchedService?.id ?? null,
    competitor_gap: result.competitorGapText,
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
