import type { Repo } from "@/lib/db/repo";
import type { Business, BusinessBrief, ReviewDigest, Signal, SignalSource } from "@/lib/db/types";
import { gradeFor, type Grade } from "@/lib/recommend/grade";
import { documentFacts } from "@/lib/documents/digest";
import { buildBusinessHistory } from "@/lib/recommend/history";
import { weekOf } from "@/lib/recommend/recommend";
import { upcomingMoments, type UpcomingMoment } from "@/lib/recommend/seasonal";
import { buildResultsTakeaway } from "@/lib/recommend/insights";
import { benchmarkFor } from "@/lib/results/benchmarks";
import { normalizeTerm } from "@/lib/signals/normalize";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { sourceUrl } from "@/lib/signals/source-url";
import { targetCustomerOf } from "@/lib/ai/brief";
import { buildAdCall, type AdCall } from "@/lib/recommend/ad-call";
import { explainOpportunity } from "@/lib/recommend/explain";
import { campaignSignalBrief, culturalForTerm, DIRECT_MIN, loadSignalContext, rivalTermRead } from "@/lib/recommend/four-signals";
import { culturalFromSignal } from "@/lib/scoring";
import { businessStateGeo, geoLabel, placeWords } from "@/lib/signals/geo";
import { readAccount } from "@/lib/social/read";

/**
 * The weekly intel report: every number on the page assembled here, each one
 * traceable to a stored signal (source + capture date) or a recorded result.
 * The only generated prose is the analyst note (lib/report/note.ts) — the
 * rest is data. Merciv-style rules: cite everything, and where the evidence
 * is thin say so instead of filling the gap.
 */

export interface RankedRow {
  rank: number;
  opportunityId: string;
  term: string;
  source: SignalSource;
  metric: string;
  deltaPct: number | null;
  score: number;
  grade: Grade;
  matchedServiceName: string | null;
  /** The relevance judge's one-line reason, when the ranking stored one. */
  snapshotReason: string | null;
  competitorGap: string | null;
  hasCampaign: boolean;
  status: string;
  /** The page the read was taken from, when the source has one. */
  sourceUrl: string | null;
  /** True when Google's regional sample was mostly zeros — an idea, not a wave. */
  sparse: boolean;
  /** How the winning short-form videos on this term are BUILT, when the
   * read came from a short-form source. The note is grounded on it so the
   * weekly advice can say what to shoot, not just what is rising. */
  format: ShortFormatRead | null;
}

/** The format facts a short-form signal carries in its raw payload. */
export interface ShortFormatRead {
  medianDurationSec: number | null;
  engagementPct: number | null;
  /** Shares + saves per view — TikTok only; YouTube exposes no equivalent. */
  actionPct: number | null;
  repeatChannels: string[];
  hashtags: string[];
  topTitle: string | null;
  breakoutTitle: string | null;
}

/** Pure: pull the format facts out of a short-form signal's raw payload.
 * Returns null for every other source, and for a short-form read that
 * predates the deep capture — an old row must not render as a format of
 * zero-second videos with no engagement. */
export function formatRead(metric: string, raw: unknown): ShortFormatRead | null {
  if (metric !== "shortform_views" || !raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  const title = (v: unknown) =>
    v && typeof v === "object" && typeof (v as { title?: unknown }).title === "string"
      ? ((v as { title: string }).title)
      : null;
  const out: ShortFormatRead = {
    medianDurationSec: num(r.medianDurationSec),
    engagementPct: num(r.engagementPct),
    actionPct: num(r.actionPct),
    repeatChannels: strs(r.repeatChannels),
    hashtags: strs(r.hashtags),
    topTitle: title(r.top),
    breakoutTitle: title(r.breakout),
  };
  const empty =
    out.medianDurationSec === null &&
    out.engagementPct === null &&
    out.actionPct === null &&
    out.repeatChannels.length === 0 &&
    out.hashtags.length === 0 &&
    out.topTitle === null;
  return empty ? null : out;
}

export interface DemandRow {
  term: string;
  /** Weekly delta from a live interest read, when one landed. */
  deltaPct: number | null;
  /** Latest 0-100 search-interest level (Google Trends scale, 7-day mean). */
  interestLevel: number | null;
  /** The read window's low-high bounds behind that level. */
  interestRange: { min: number; max: number } | null;
  /** True when the term is too small for Google's regional sampling —
   * mostly-zero days; shown as "low search volume", never a fake zero. */
  interestSparse: boolean;
  /** When the read had to widen to land ("cold plunge · US-wide"), what was
   * actually measured — always shown next to the number. */
  interestMeasuredAs: string | null;
  interestSource: SignalSource | null;
  /** Where the interest read can be checked, when the source has a page. */
  interestUrl: string | null;
  /** Raw Meta keyword matches when the sample was mostly other industries
   * or spam — shown as matches, never as competitors, and never scored. */
  adMatchesUnusable: number | null;
  /** Recent local news mentions (null = no read captured). */
  coverageCount: number | null;
  /** Active Meta ads matching the term near the business (null = no read). */
  adCount: number | null;
  /** Most recent capture date across this term's reads, yyyy-mm-dd. */
  lastRead: string | null;
}

export interface CompetitorRow {
  term: string;
  adCount: number;
  /** Sample ads that actually speak to the term. */
  ads: { advertiser: string; snippet: string }[];
  /** Sample ads dropped as keyword noise — other industries, spam. */
  unrelated: number;
  /** False when the sample was mostly noise: the count is noise too. */
  countUsable: boolean;
  /** Keyword total scaled by the relevant share of the sample — the number
   * a rival count should quote. Null when unusable. */
  estimate: number | null;
  capturedAt: string;
}

export interface MoverRow {
  term: string;
  deltaPct: number;
  metric: string;
  source: SignalSource;
  sourceUrl: string | null;
}

/** A named competitor's latest reads — the "competitor moves" section. */
export interface WatchedCompetitor {
  name: string;
  ads: {
    count: number | null;
    /** The read's honest one-liner (franchise-scale totals are labeled). */
    summary: string;
    day: string;
    creatives: { advertiser: string; snippet: string }[];
  } | null;
  reviews: { rating: number | null; count: number | null; day: string } | null;
  /** Ad count a week earlier, when we hold one — the delta the owner feels. */
  previousAdCount: number | null;
  /** Why TRND counts them as a direct rival, in one sentence. */
  directnessReason?: string | null;
  /** False for a neighbour that sells something else; true or unknown otherwise. */
  direct?: boolean;
  /** Their posting: cadence and the move worth knowing about this week. */
  social?: { summary: string; day: string; moves: string[] } | null;
  /** What they are paying to show on Google. */
  googleAds?: { summary: string; day: string } | null;
}

export interface SourceCount {
  source: SignalSource;
  count: number;
  /** Most recent capture, yyyy-mm-dd. */
  latest: string;
}

export interface IntelReport {
  week: string;
  weekEnd: string;
  generatedAt: string;
  signalsWatched: number;
  sourceCounts: SourceCount[];
  ranked: RankedRow[];
  demand: DemandRow[];
  competitors: CompetitorRow[];
  movers: MoverRow[];
  seasonal: UpcomingMoment[];
  competitorsWatched: WatchedCompetitor[];
  voice: ReviewDigest | null;
  results: {
    launched: number;
    totalCampaigns: number;
    avgCtr: number | null;
    benchmark: number;
    roas: number | null;
    takeaway: string | null;
  };
  brief: BusinessBrief | null;
  /** What TRND remembers — rankings, ads, results, passes, rival moves over
   * the last six weeks — as FACTS lines. See lib/recommend/history. */
  history: string[];
  /** What the owner uploaded — menu, sales, brand, results — as FACTS lines. */
  documents: string[];
  /** The week's call on the #1 pick: run this ad, to whom, where, how, why. */
  call?: AdCall | null;
  /** The campaign behind the call, when one is written. */
  callCampaignId?: string | null;
}

const day = (iso: string) => iso.slice(0, 10);

export async function buildIntelReport(repo: Repo, business: Business): Promise<IntelReport> {
  const week = weekOf();
  const weekEnd = day(new Date(new Date(`${week}T00:00:00Z`).getTime() + 6 * 86400_000).toISOString());

  const [signals, opportunities, campaigns, results, services, brief, namedCompetitors, competitorReads, voice] =
    await Promise.all([
      repo.listSignalsForCategory(business.category, {
        sinceDays: 14,
        geo: businessStateGeo(business),
      }),
      repo.listOpportunities(business.id, week),
      repo.listCampaigns(business.id),
      repo.listResultsForBusiness(business.id),
      repo.listServices(business.id),
      repo.getBusinessBrief(business.id),
      repo.listCompetitors(business.id),
      repo.listCompetitorReads(business.id, { sinceDays: 30 }),
      repo.getReviewDigest(business.id),
    ]);

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const campaignOppIds = new Set(campaigns.map((c) => c.opportunity_id));

  // ---- ranked opportunities, each with its signal and judge reason
  const active = opportunities.filter((o) => o.status !== "dismissed");
  const signalById = new Map(
    (await repo.getSignalsByIds(active.map((o) => o.signal_id))).map((s) => [s.id, s]),
  );
  const ranked: RankedRow[] = [];
  for (const [i, o] of active.entries()) {
    const signal = signalById.get(o.signal_id);
    if (!signal) continue;
    ranked.push({
      rank: i + 1,
      opportunityId: o.id,
      term: signal.term,
      source: signal.source,
      metric: signal.metric_type,
      deltaPct: signal.delta_pct,
      score: Number(o.score),
      grade: gradeFor(Number(o.score)),
      matchedServiceName: o.matched_service_id
        ? (serviceById.get(o.matched_service_id)?.name ?? null)
        : null,
      snapshotReason: o.rationale?.match(/Snapshot read: (.+)$/)?.[1] ?? null,
      // Only a measured read is worth a sentence on the report. "Scored as
      // unknown" under six picks in a row reads like a scraper's caveat; the
      // pick page's Signal read already says what was not factored in.
      competitorGap: o.competitor_gap && !/scored as unknown/.test(o.competitor_gap) ? o.competitor_gap : null,
      hasCampaign: campaignOppIds.has(o.id),
      status: o.status,
      sourceUrl: sourceUrl(signal),
      sparse: (signal.raw as { sparse?: boolean } | null)?.sparse === true,
      format: formatRead(signal.metric_type, signal.raw),
    });
  }

  // ---- demand tracker: the snapshot's watch terms and what we hold on each
  const byNormalized = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = byNormalized.get(s.normalized_term) ?? [];
    list.push(s);
    byNormalized.set(s.normalized_term, list);
  }
  const readsFor = (normalized: string): Signal[] => {
    const exact = byNormalized.get(normalized) ?? [];
    // Ad-library reads are stored as "<term> <city>" — include prefix rows.
    const prefixed = [...byNormalized.entries()]
      .filter(([key]) => key.startsWith(`${normalized}_`))
      .flatMap(([, rows]) => rows);
    return [...exact, ...prefixed];
  };
  const demand: DemandRow[] = (brief?.watch_terms ?? []).map((term) => {
    const reads = readsFor(normalizeTerm(term));
    // Prefer a real interest/volume read (level + delta); any scorable read
    // with a delta still carries the trend column.
    const interest =
      reads.find((s) => s.metric_type === "search_interest" || s.metric_type === "search_volume") ??
      reads.find(
        (s) =>
          typeof s.delta_pct === "number" &&
          s.metric_type !== "news_coverage" &&
          s.metric_type !== "ad_saturation",
      );
    const interestRaw = interest?.raw as
      | {
          min?: number | null;
          max?: number | null;
          sparse?: boolean;
          adjusted?: boolean;
          measuredTerm?: string;
          measuredGeo?: string;
        }
      | null
      | undefined;
    const interestRange =
      typeof interestRaw?.min === "number" && typeof interestRaw?.max === "number"
        ? { min: interestRaw.min, max: interestRaw.max }
        : null;
    const interestSparse = interestRaw?.sparse === true;
    const interestMeasuredAs =
      interestRaw?.adjusted && interestRaw.measuredTerm
        ? `${interestRaw.measuredTerm}${interestRaw.measuredGeo === "US" ? " · US-wide" : ""}`
        : null;
    const coverage = reads.find((s) => s.metric_type === "news_coverage" && typeof s.value === "number");
    const adRead = reads.find((s) => s.metric_type === "ad_saturation" && typeof s.value === "number");
    const adAssessed = adRead
      ? assessAdRead(
          (adRead.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads,
          adRead.term,
          placeWords(business),
          adRead.value as number,
        )
      : null;
    const lastRead = reads.length
      ? reads.map((s) => day(s.captured_at)).sort().at(-1)!
      : null;
    return {
      term,
      deltaPct: interest?.delta_pct ?? null,
      interestLevel: typeof interest?.value === "number" ? interest.value : null,
      interestRange,
      interestSparse,
      interestMeasuredAs,
      interestSource: interest?.source ?? null,
      interestUrl: interest ? sourceUrl(interest) : null,
      coverageCount: (coverage?.value as number | undefined) ?? null,
      adCount: adAssessed?.count ?? null,
      adMatchesUnusable: adAssessed && adAssessed.count === null ? (adRead!.value as number) : null,
      lastRead,
    };
  });

  // ---- competitor intelligence: real Meta Ad Library reads with the ads
  const competitors: CompetitorRow[] = signals
    .filter((s) => s.metric_type === "ad_saturation" && typeof s.value === "number")
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
    .slice(0, 6)
    .map((s) => {
      const read = assessAdRead(
        (s.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads,
        s.term,
        placeWords(business),
        s.value as number,
      );
      return {
        term: s.term,
        adCount: s.value as number,
        ads: read.ads.slice(0, 3),
        unrelated: read.unrelated,
        countUsable: read.countUsable,
        estimate: read.count,
        capturedAt: day(s.captured_at),
      };
    })
    .filter((row) => row.adCount > 0 || row.ads.length > 0);

  // ---- market pulse: category movers, context only
  const movers: MoverRow[] = signals
    .filter(
      (s): s is Signal & { delta_pct: number } =>
        typeof s.delta_pct === "number" &&
        s.metric_type !== "news_coverage" &&
        s.metric_type !== "ad_saturation",
    )
    .sort((a, b) => b.delta_pct - a.delta_pct)
    .slice(0, 6)
    .map((s) => ({ term: s.term, deltaPct: s.delta_pct, metric: s.metric_type, source: s.source, sourceUrl: sourceUrl(s) }));

  // ---- named-competitor moves: latest read per kind, plus the week-ago
  // ad count so "they scaled" is a number, not a vibe
  const competitorsWatched: WatchedCompetitor[] = namedCompetitors.map((c) => {
    const mine = competitorReads
      .filter((r) => r.competitor_id === c.id)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
    const latestAds = mine.find((r) => r.kind === "ads") ?? null;
    const latestReviews = mine.find((r) => r.kind === "reviews") ?? null;
    const latestSocial = mine.find((r) => r.kind === "social") ?? null;
    const latestGoogle = mine.find((r) => r.kind === "google_ads") ?? null;
    const moves = ((latestSocial?.raw as { moves?: { line?: string }[] } | null)?.moves ?? [])
      .map((m) => m.line)
      .filter((l): l is string => typeof l === "string")
      .slice(0, 2);
    const weekAgoAds =
      mine.find(
        (r) =>
          r.kind === "ads" &&
          latestAds !== null &&
          r.captured_at < latestAds.captured_at &&
          new Date(latestAds.captured_at).getTime() - new Date(r.captured_at).getTime() >= 5 * 86400_000,
      ) ?? null;
    return {
      name: c.name,
      ads: latestAds
        ? {
            count: latestAds.value,
            summary: latestAds.summary,
            day: day(latestAds.captured_at),
            creatives: (((latestAds.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads) ?? []).slice(0, 2),
          }
        : null,
      reviews: latestReviews
        ? { rating: latestReviews.rating, count: latestReviews.value, day: day(latestReviews.captured_at) }
        : null,
      previousAdCount: weekAgoAds?.value ?? null,
      directnessReason: c.directness_reason ?? null,
      direct: c.directness === null || c.directness === undefined || c.directness >= DIRECT_MIN,
      social: latestSocial ? { summary: latestSocial.summary, day: day(latestSocial.captured_at), moves } : null,
      googleAds: latestGoogle ? { summary: latestGoogle.summary, day: day(latestGoogle.captured_at) } : null,
    };
  });
  // Direct rivals first: the neighbour that sells something else is context.
  competitorsWatched.sort((a, b) => Number(b.direct !== false) - Number(a.direct !== false));

  // ---- the call on the #1 pick, from the same evidence the dashboard reads
  let call: AdCall | null = null;
  let callCampaignId: string | null = null;
  const lead = active[0];
  if (lead) {
    try {
      const signal = signalById.get(lead.signal_id);
      if (signal) {
        // The explanation reuses this context and the reads above instead
        // of loading its own copies.
        const signalCtx = await loadSignalContext(repo, business, brief, signals);
        const [explained, campaign] = await Promise.all([
          explainOpportunity(repo, business, lead, signal, { services, brief, signalCtx }),
          repo.getCampaignByOpportunity(lead.id),
        ]);
        const signalBrief = campaignSignalBrief(signal, signalCtx);
        const scripts = campaign
          ? (await repo.listCreatives(campaign.id))
              .filter((c) => c.kind === "script")
              .sort((a, b) => a.variant_index - b.variant_index)
              .map((c) => c.content)
          : [];
        const cultural = culturalFromSignal(signal) ?? culturalForTerm(signal, signalCtx.shortform);
        callCampaignId = campaign?.id ?? null;
        call = buildAdCall({
          term: signal.term,
          score: Number(lead.score),
          signals: explained.signals,
          signalReasons: explained.signalReasons,
          service: explained.matchedService,
          targetCustomer: targetCustomerOf(brief),
          campaign: campaign
            ? { angle: campaign.angle, hook: campaign.hook, offer: campaign.offer, audience: campaign.audience }
            : null,
          scripts,
          culturalPlatform: cultural?.platform ?? null,
          ownVideoShare: signalCtx.ownPosts.length >= 5 ? readAccount(signalCtx.ownPosts).videoShare : null,
          adPlatforms: business.ad_platforms,
          medianDurationSec: signalBrief.medianDurationSec,
          weekPct: explained.weekPct ?? null,
          monthPct: explained.monthPct ?? null,
          geoLabel: geoLabel(signal.geo),
          audiencePhrase: explained.audiencePhrase ?? null,
          rivals: rivalTermRead(signal.term, signalCtx),
          rivalThemes: signalBrief.rivalThemes,
          ownBestTheme: signalBrief.ownBestTheme,
        });
      }
    } catch (err) {
      console.warn("[report] the call failed (non-fatal):", (err as Error).message);
    }
  }

  // ---- source provenance
  const bySource = new Map<SignalSource, { count: number; latest: string }>();
  for (const s of signals) {
    const cur = bySource.get(s.source) ?? { count: 0, latest: "" };
    cur.count += 1;
    const d = day(s.captured_at);
    if (d > cur.latest) cur.latest = d;
    bySource.set(s.source, cur);
  }
  const sourceCounts: SourceCount[] = [...bySource.entries()]
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.count - a.count);

  // ---- results to date
  const launched = campaigns.filter((c) => c.status === "live" || c.status === "complete").length;
  const ctrs = results.map((r) => (r.ctr === null ? null : Number(r.ctr))).filter((v): v is number => v !== null);
  const avgCtr = ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null;
  const sum = (f: (r: (typeof results)[number]) => number | null) =>
    results.reduce((acc, r) => acc + (f(r) ?? 0), 0);
  const totalSpend = sum((r) => r.spend_cents);
  const roas = totalSpend > 0 ? sum((r) => r.revenue_cents) / totalSpend : null;
  const benchmark = benchmarkFor(business.category);

  const watched = signals.filter(
    (s) => s.metric_type !== "news_coverage" && s.metric_type !== "ad_saturation",
  );
  const [history, docs] = await Promise.all([buildBusinessHistory(repo, business), repo.listDocuments(business.id)]);

  return {
    history: history.lines,
    documents: documentFacts(docs),
    week,
    weekEnd,
    generatedAt: new Date().toISOString(),
    signalsWatched: watched.length,
    sourceCounts,
    ranked,
    demand,
    competitors,
    movers,
    seasonal: upcomingMoments(business.category),
    competitorsWatched,
    call,
    callCampaignId,
    voice,
    results: {
      launched,
      totalCampaigns: campaigns.length,
      avgCtr,
      benchmark,
      roas,
      takeaway: buildResultsTakeaway({ avgCtr, benchmark, roas }),
    },
    brief,
  };
}
