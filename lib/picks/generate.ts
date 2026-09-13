import { bestTheme, historyOnTerm } from "@/lib/ads/history-read";
import { defaultPickWriter, fallbackPickWrite, type PickWriter, type PickWriterInput } from "@/lib/ai/pick-writer";
import type { Repo } from "@/lib/db/repo";
import type { Business, BusinessBrief, NewPickBundle, Opportunity, Service, Signal } from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { explainOpportunity } from "@/lib/recommend/explain";
import { campaignSignalBrief, loadSignalContext, type SignalContext } from "@/lib/recommend/four-signals";
import { weekOf as currentWeek } from "@/lib/recommend/week";
import { isCulturalSource } from "@/lib/scoring";
import { rankScoreOf } from "@/lib/scoring/grade-opportunity";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { isOnlineBusiness, placeWords } from "@/lib/signals/geo";
import { engagementOf, postsOnTerm } from "@/lib/social/read";

import { pickBet } from "./bet";
import { buildEvidence, type EvidenceFacts } from "./evidence";
import { formatMetric } from "./format";
import { metricLabelFor, metricLevel, pickMetric, sparklineOf } from "./metric";
import { validatePickWrite, type PickWrite } from "./schema";

/**
 * The weekly job that writes a brand's picks: one run per brand per week,
 * all five at once, from the opportunities the ranking already scored.
 *
 * Numbers come from code (metric.ts, bet.ts), evidence from facts
 * (evidence.ts), words from the writer (lib/ai/pick-writer.ts). Nothing is
 * re-ranked or re-scored here: the ranking decided what is worth an ad, and
 * this decides what the ad is.
 *
 * Runs in the cron, after a rerank, and at the end of onboarding. Never in a
 * page request: the model calls take a minute.
 */

export const PICKS_PER_WEEK = 5;
export const DEFAULT_SCRIPT_SECONDS = 20;

export interface GenerateWeekPicksOptions {
  /** Defaults to this week. */
  weekOf?: string;
  /** False builds the bundles without storing them. Defaults to true. */
  write?: boolean;
  /** Pre-resolved Gemini models, so a batch run lists models once. */
  models?: { flash: string; pro: string };
  /** Replaces the default writer (Gemini, or the keyless template). */
  writer?: PickWriter;
}

export interface GenerateWeekPicksResult {
  ready: number;
  draft: number;
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
 * placement will actually hold. Organic TikToks on a term can run 80 seconds
 * and a trend clip can run 7; a Reels or TikTok ad that works runs 15 to 45. */
function scriptSeconds(medianSec: number | null): number {
  return typeof medianSec === "number" && medianSec > 0
    ? Math.min(45, Math.max(15, Math.round(medianSec)))
    : DEFAULT_SCRIPT_SECONDS;
}

/** Below this, a short-form view count is too small to carry a percentage:
 * "+200% week over week" on 688 views is a rounding error dressed as news. */
const MIN_SHORTFORM_VIEWS = 5_000;

/**
 * The signal the pick's one metric is read from. Normally the pick's own. A
 * short-form read on a tiny base hands over to a search read on the same term
 * when one exists; with none, there is no honest metric and the pick stays a
 * draft ("better to show four picks than one broken one").
 */
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

function rivalFacts(term: string, ctx: SignalContext): Pick<EvidenceFacts, "rivalAds" | "rivalPosts"> {
  const names = new Map(ctx.direct.map((c) => [c.id, c.name]));
  const rivalAds: EvidenceFacts["rivalAds"] = [];
  for (const read of ctx.adReads) {
    const rival = names.get(read.competitor_id);
    if (!rival) continue;
    const stored = (read.raw as { ads?: unknown } | null)?.ads;
    const ads = (Array.isArray(stored) ? (stored as StoredAd[]) : []).map((a) => ({
      caption: [a.headline, a.snippet].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" "),
      url: typeof a.url === "string" && a.url.startsWith("https://") ? a.url : null,
      runningDays: typeof a.runningDays === "number" ? a.runningDays : null,
    }));
    // One ad per rival: two lines from the same brand read as a crowd.
    const onTerm = postsOnTerm(ads, term).find((a) => a.caption);
    if (onTerm) rivalAds.push({ rival, text: onTerm.caption, url: onTerm.url, runningDays: onTerm.runningDays });
  }
  // The longest-running ad first: it is the one that is working.
  rivalAds.sort((a, b) => (b.runningDays ?? 0) - (a.runningDays ?? 0));
  const rivalPosts = postsOnTerm(ctx.rivalPosts, term)
    .filter((p) => p.competitor_id && names.has(p.competitor_id) && p.caption.trim())
    .sort((a, b) => engagementOf(b) - engagementOf(a))
    .slice(0, 2)
    .map((p) => ({ rival: names.get(p.competitor_id as string) as string, caption: p.caption, url: p.url || null, platform: p.platform }));
  return { rivalAds, rivalPosts };
}

function adLibraryFact(business: Business, signal: Signal, pool: Signal[]): EvidenceFacts["adLibrary"] {
  const read = pool.find((s) => s.metric_type === "ad_saturation" && typeof s.value === "number" && matchesTerm(s, signal));
  if (!read) return null;
  const sample = (read.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads;
  // The same relevance gate the ranking used: a keyword sample that is
  // mostly other industries says nothing about this field.
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
  // Under a handful of posts, "did well" has no usual to beat.
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
  // "ran too few impressions to call" is a non-read; only a comparison counts.
  return h.ads > 0 && /above|below|about even/.test(h.reason) ? h.reason : null;
}

interface WeekInputs {
  business: Business;
  services: Service[];
  brief: BusinessBrief | null;
  pool: Signal[];
  ctx: SignalContext;
  writer: PickWriter;
}

async function buildBundle(repo: Repo, input: WeekInputs, opportunity: Opportunity): Promise<NewPickBundle | null> {
  const { business, services, brief, pool, ctx, writer } = input;
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

  const evidence = buildEvidence({
    term: signal.term,
    signal,
    deltaPct: metric?.metric_delta_pct ?? null,
    online: isOnlineBusiness(business),
    audiencePhrase: explained.audiencePhrase ?? null,
    shortform,
    ...rivalFacts(signal.term, ctx),
    adLibrary: adLibraryFact(business, signal, pool),
    ownBestTheme: bestTheme(ctx.history),
    ownHistoryOnTerm: ownHistoryFact(signal.term, ctx),
    ownPost: ownPostFact(signal.term, ctx),
  });

  const signals = campaignSignalBrief(signal, ctx);
  const formatted = metric ? formatMetric(metric) : null;
  const writerInput: PickWriterInput = {
    business,
    term: signal.term,
    movement: formatted ? { label: formatted.label, direction: formatted.direction, window: formatted.window } : null,
    matchedService: matched,
    services,
    brief,
    signals,
    evidence: evidence.map((e) => ({ signal: e.signal, claim: e.claim })),
    durationSec: scriptSeconds(signals.medianDurationSec),
    deltaPct: metric?.metric_delta_pct ?? null,
  };

  let written: PickWrite | null = null;
  try {
    const checked = validatePickWrite(await writer(writerInput), { term: signal.term, deltaPct: writerInput.deltaPct });
    if (checked.ok) written = checked.value;
    else console.warn(`[picks] "${signal.term}" failed validation, stored as draft: ${checked.error}`);
  } catch (err) {
    console.warn(`[picks] "${signal.term}" writer failed, stored as draft:`, (err as Error).message);
  }
  // A draft still needs a finding and a line for the columns; the template
  // supplies them, and the draft never reaches the list.
  const words = written ?? fallbackPickWrite(writerInput);
  const ready = written !== null && metric !== null && written.scripts.length === 3 && evidence.length > 0;
  const bet = pickBet(business, ctx.history);

  return {
    pick: {
      opportunity_id: opportunity.id,
      rank: 0,
      geo: signal.geo,
      term: signal.term,
      finding: words.finding,
      metric_label: metric?.metric_label ?? metricLabelFor(signal),
      metric_value: metric?.metric_value ?? metricLevel(signal),
      metric_delta_pct: metric?.metric_delta_pct ?? null,
      metric_window: metric?.metric_window ?? "30d",
      sparkline: metric?.sparkline ?? sparklineOf(series),
      ...bet,
      bet_what: words.bet_what,
      guardrail: written?.guardrail ?? null,
      // The grade the week was ranked on travels with the pick, so the pick
      // page shows the same verdict and signal breakdown as the ranking.
      grade: opportunity.grade ?? null,
      grade_score: opportunity.grade_score == null ? null : Number(opportunity.grade_score),
      signal_scores: opportunity.signal_scores ?? {},
      status: ready ? "ready" : "draft",
    },
    evidence,
    // Only validated scripts are stored. A draft with none can never be
    // promoted to ready by the database's own check.
    scripts: written ? written.scripts : [],
  };
}

export async function generateWeekPicks(
  repo: Repo,
  business: Business,
  opts: GenerateWeekPicksOptions = {},
): Promise<GenerateWeekPicksResult> {
  const week = opts.weekOf ?? currentWeek();
  const stored = (await repo.listOpportunities(business.id, week)).filter((o) => o.status !== "dismissed");
  // Once the week has graded rows, an ungraded one is a leftover from a
  // ranking before the model, and its legacy score says nothing about
  // whether the model would hold it. Only a week with no grades at all
  // still ranks on the legacy score.
  const graded = stored.some((o) => o.grade);
  const opportunities = stored
    // A Hold is "don't build a campaign yet". The ranking no longer stores
    // one, but a row written by hand or by an older ranking must still never
    // become a pick.
    .filter((o) => o.grade !== "Hold" && (!graded || o.grade))
    .sort((a, b) => rankScoreOf(b) - rankScoreOf(a))
    .slice(0, PICKS_PER_WEEK);
  // An empty ranking (held for a missing analysis, or nothing fits) leaves
  // last run's picks alone rather than wiping the week.
  if (opportunities.length === 0) return { ready: 0, draft: 0, pickIds: [], bundles: [] };

  const [services, brief, pool] = await Promise.all([
    repo.listServices(business.id),
    repo.getBusinessBrief(business.id),
    // The same two-week pool the ranking and explainOpportunity read.
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
  ]);
  const ctx = await loadSignalContext(repo, business, brief, pool);
  const inputs: WeekInputs = {
    business,
    services,
    brief,
    pool,
    ctx,
    writer: opts.writer ?? defaultPickWriter(opts.models),
  };

  const built = await Promise.all(
    opportunities.map(async (o) => {
      try {
        return await buildBundle(repo, inputs, o);
      } catch (err) {
        console.warn(`[picks] opportunity ${o.id} failed (non-fatal):`, (err as Error).message);
        return null;
      }
    }),
  );
  // Ranks are contiguous over what was built: a skipped row must not leave
  // the list starting at #2.
  const bundles = built
    .filter((b): b is NewPickBundle => b !== null)
    .map((b, i) => ({ ...b, pick: { ...b.pick, rank: i + 1 } }));
  if (bundles.length === 0) return { ready: 0, draft: 0, pickIds: [], bundles };

  const ready = bundles.filter((b) => b.pick.status === "ready").length;
  const pickIds = opts.write === false ? [] : await repo.replaceWeekPicks(business.id, week, bundles);
  return { ready, draft: bundles.length - ready, pickIds, bundles };
}
