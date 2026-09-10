import type { Repo } from "@/lib/db/repo";
import type { Business, NewSignal } from "@/lib/db/types";

import { weekOf } from "@/lib/recommend/recommend";

import { createDataForSeoAdapter } from "./adapters/dataforseo";
import { createGoogleNewsAdapter } from "./adapters/google-news";
import { createGoogleTrendsRssAdapter } from "./adapters/google-trends-rss";
import { createRedditAdapter } from "./adapters/reddit";
import { createSuggestAdapter } from "./adapters/suggest";
import { createTiktokCcAdapter } from "./adapters/tiktok-cc";
import { createTrendsIotAdapter } from "./adapters/trends-iot";
import { createTrendsRelatedAdapter } from "./adapters/trends-related";
import { createWeatherAdapter } from "./adapters/weather";
import { createYoutubeAdapter } from "./adapters/youtube";
import { createMetaAdsAdapter } from "./adlibrary";
import { CATEGORY_CONFIGS } from "./category-terms";
import { resolveMetro } from "./geo";
import { normalizeTerm } from "./normalize";
import type { AdapterRunReport, SignalAdapter, WatchPlace, WatchSubreddit } from "./types";

export interface IngestSummary {
  day: string;
  reports: AdapterRunReport[];
  totalSignals: number;
  totalSeriesPoints: number;
}

/** The tokens that make a watch term local — strippable when an adapter has
 * to widen a too-narrow read ("cold plunge nyc" → "cold plunge"). */
export function localityTokens(business: Business): string[] {
  return [
    ...business.city.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    ...(business.region ? [business.region.toLowerCase()] : []),
    "nyc",
    "near",
    "me",
    "local",
  ];
}

/** Raw adapter output → insert rows (shared by the daily job and the
 * per-business first-day ingest). */
function toSignalRows(raw: Awaited<ReturnType<SignalAdapter["fetch"]>>): NewSignal[] {
  return raw
    .filter((r) => r.term.trim().length > 0)
    .map((r) => ({
      source: r.source,
      term: r.term,
      normalized_term: normalizeTerm(r.term),
      category: r.category || "General",
      geo: r.geo,
      metric_type: r.metric_type,
      value: r.value,
      delta_pct: r.delta_pct,
      window_days: r.window_days,
      raw: r.raw,
    }));
}

/**
 * Day-one demand reads for ONE business: its snapshot watch terms through
 * the targeted adapters (search volume, news coverage, ad library, trends)
 * — so a new business's demand tracker fills in at onboarding instead of
 * waiting for the next daily cron. Idempotent like the daily job.
 */
export async function runSignalIngestForBusiness(
  repo: Repo,
  business: Business,
): Promise<number> {
  const brief = await repo.getBusinessBrief(business.id);
  // Brief v5 watchlists run 18-30 terms; day one reads the strongest dozen.
  const terms = (brief?.watch_terms ?? []).slice(0, 12);
  if (terms.length === 0) return 0;
  const stateGeo = business.region ? `US-${business.region.toUpperCase()}` : "US";
  const locality = localityTokens(business);
  const watch = terms.map((t) => ({
    term: t.toLowerCase().trim(),
    category: business.category,
    geo: stateGeo,
    locality,
  }));
  const adapters: SignalAdapter[] = [
    // Short-form first: what a shop can act on this week is what people are
    // watching, and day one should show that rather than search alone.
    createYoutubeAdapter(),
    createTiktokCcAdapter(),
    createDataForSeoAdapter(),
    createGoogleNewsAdapter(),
    createMetaAdsAdapter(),
    createTrendsIotAdapter(),
  ];
  let written = 0;
  for (const adapter of adapters) {
    try {
      if (!(await adapter.isAvailable())) continue;
      const raw = await adapter.fetch({ terms: [], watch, geo: "US", windowDays: 7 });
      written += await repo.upsertSignals(toSignalRows(raw));
      if (adapter.fetchSeries) {
        const series = await adapter.fetchSeries({ terms: [], watch, geo: "US", windowDays: 7 });
        await repo.upsertSeriesPoints(
          series.map((p) => ({
            normalized_term: normalizeTerm(p.term),
            geo: p.geo,
            day: p.day,
            value: p.value,
          })),
        );
      }
    } catch (err) {
      console.warn(`[ingest:business] adapter ${adapter.name} failed:`, (err as Error).message);
    }
  }
  return written;
}

/** Rejects with "timed out" when the adapter call outlives its slice — the
 * underlying promise is abandoned, not cancelled (fetch keys off its own
 * signal internally; we just stop waiting). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function defaultAdapters(): SignalAdapter[] {
  // Order is priority, not preference: the run has a wall-clock budget, and
  // whatever sits at the bottom is what gets skipped on a slow day. Short-
  // form social leads because it's the basis of the product — YouTube Shorts
  // per business term (key-gated), then TikTok's trending boards. Search
  // volume follows as the demand backbone that confirms a trend is being
  // acted on, then the saturation and context reads, then the fragile
  // unofficial Trends endpoints last, where a failure costs nothing.
  return [
    createYoutubeAdapter(),
    createTiktokCcAdapter(),
    createDataForSeoAdapter(),
    createGoogleTrendsRssAdapter(),
    createWeatherAdapter(),
    createSuggestAdapter(),
    createRedditAdapter(),
    createGoogleNewsAdapter(),
    createMetaAdsAdapter(),
    createTrendsIotAdapter(),
    createTrendsRelatedAdapter(),
  ];
}

/**
 * Runs every adapter, tolerating individual failures — the job succeeds with
 * partial results. Everything raw is kept in signals.raw; the daily unique
 * index makes re-runs idempotent (never re-hit a source you already stored
 * today — dupes are dropped at the DB layer).
 */
export async function runIngest(
  repo: Repo,
  opts: {
    geo?: string;
    windowDays?: number;
    adapters?: SignalAdapter[];
    /** Wall-clock cap for the whole run — adapters not yet started when it's
     * spent are skipped, so the cron route answers inside Vercel's 300s
     * maxDuration instead of 504ing (a hung adapter used to eat the rest of
     * the run). */
    budgetMs?: number;
    /** Cap for a single adapter fetch/fetchSeries call. */
    adapterTimeoutMs?: number;
  } = {},
): Promise<IngestSummary> {
  const startedAt = Date.now();
  const geo = opts.geo ?? "US";
  const windowDays = opts.windowDays ?? 7;
  const adapters = opts.adapters ?? defaultAdapters();
  const budgetMs = opts.budgetMs ?? 240_000;
  const adapterTimeoutMs = opts.adapterTimeoutMs ?? 60_000;
  // A call's slice never exceeds what's left of the whole-run budget.
  const sliceMs = () =>
    Math.min(adapterTimeoutMs, Math.max(budgetMs - (Date.now() - startedAt), 0));
  const watchTerms = CATEGORY_CONFIGS.flatMap((c) => c.watchTerms.slice(0, 3));

  // The personalized half of the watchlist: every business's snapshot names
  // the search phrases its real customers use. TRND watches what each
  // business sells — not just its category. The snapshot's watchlist is the
  // backbone (up to 24 terms per business, metro-scoped); the category's
  // stock terms are the floor beneath it.
  const seen = new Set<string>();
  const watch: { term: string; category: string; geo?: string; locality?: string[] }[] = [];
  const addWatch = (term: string, category: string, termGeo?: string, locality?: string[]) => {
    const key = term.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    watch.push({ term: key, category, geo: termGeo, locality });
  };
  for (const c of CATEGORY_CONFIGS) for (const t of c.watchTerms.slice(0, 3)) addWatch(t, c.category);
  // Communities: stock per-category lists, widened by each snapshot's own.
  const seenSubs = new Set<string>();
  const subreddits: WatchSubreddit[] = [];
  const addSubreddit = (name: string, category: string) => {
    const key = name.replace(/^r\//i, "").trim();
    if (!key || seenSubs.has(key.toLowerCase())) return;
    seenSubs.add(key.toLowerCase());
    subreddits.push({ name: key, category });
  };
  for (const c of CATEGORY_CONFIGS) for (const s of c.subreddits) addSubreddit(s, c.category);
  const placeMap = new Map<string, WatchPlace>();
  try {
    const week = weekOf();
    for (const b of await repo.listAllBusinesses()) {
      const brief = await repo.getBusinessBrief(b.id);
      // A business's own terms watch its own METRO where the city resolves
      // to one (Google Trends takes DMA geos), its state otherwise — never
      // the whole country. Local demand measured locally is the product.
      const metro = resolveMetro(b.city, b.region);
      const stateGeo = b.region ? `US-${b.region.toUpperCase()}` : "US";
      const bizGeo = metro?.geo ?? stateGeo;
      const locality = localityTokens(b);
      for (const t of (brief?.watch_terms ?? []).slice(0, 24)) addWatch(t, b.category, bizGeo, locality);
      for (const s of (brief?.subreddits ?? []).slice(0, 6)) addSubreddit(s, b.category);
      // This week's ranked terms too — so their saturation read is real.
      for (const o of (await repo.listOpportunities(b.id, week)).slice(0, 5)) {
        const sig = await repo.getSignal(o.signal_id);
        if (sig) addWatch(`${sig.term} ${b.city}`, b.category, stateGeo);
      }
      // One weather read per place, tagged with every category present there.
      const placeKey = bizGeo;
      const place = placeMap.get(placeKey) ?? {
        city: b.city,
        region: b.region,
        geo: bizGeo,
        lat: metro?.lat ?? null,
        lng: metro?.lng ?? null,
        categories: [],
      };
      if (!place.categories.includes(b.category)) place.categories.push(b.category);
      placeMap.set(placeKey, place);
    }
  } catch (err) {
    console.warn("[ingest] business watchlist unavailable:", (err as Error).message);
  }
  const places = [...placeMap.values()];

  const reports: AdapterRunReport[] = [];
  let totalSignals = 0;
  let totalSeriesPoints = 0;

  for (const adapter of adapters) {
    const report: AdapterRunReport = { adapter: adapter.name, ok: false, signals: 0, seriesPoints: 0 };
    if (Date.now() - startedAt >= budgetMs) {
      report.skipped = "time budget exhausted";
      report.ok = true;
      reports.push(report);
      continue;
    }
    try {
      if (!(await adapter.isAvailable())) {
        report.skipped = "unavailable (missing key or open circuit)";
        report.ok = true;
        reports.push(report);
        continue;
      }
      const raw = await withTimeout(
        adapter.fetch({ terms: watchTerms, watch, places, subreddits, geo, windowDays }),
        sliceMs(),
      );
      report.signals = await repo.upsertSignals(toSignalRows(raw));
      if (adapter.fetchSeries) {
        const series = await withTimeout(
          adapter.fetchSeries({ terms: watchTerms, watch, places, subreddits, geo, windowDays }),
          sliceMs(),
        );
        report.seriesPoints = await repo.upsertSeriesPoints(
          series.map((p) => ({
            normalized_term: normalizeTerm(p.term),
            geo: p.geo,
            day: p.day,
            value: p.value,
          })),
        );
      }
      report.ok = true;
      totalSignals += report.signals;
      totalSeriesPoints += report.seriesPoints;
    } catch (err) {
      report.error = (err as Error).message;
      console.warn(`[ingest] adapter ${adapter.name} failed:`, report.error);
    }
    reports.push(report);
  }

  return {
    day: new Date().toISOString().slice(0, 10),
    reports,
    totalSignals,
    totalSeriesPoints,
  };
}
