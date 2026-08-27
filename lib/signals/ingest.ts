import type { Repo } from "@/lib/db/repo";
import type { NewSignal } from "@/lib/db/types";

import { weekOf } from "@/lib/recommend/recommend";

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

function defaultAdapters(): SignalAdapter[] {
  // Reliable + keyless first (RSS, weather, autocomplete), then Reddit,
  // News, TikTok Creative Center (unofficial, per-industry), the fragile
  // Trends widget endpoints (interest-over-time + rising related queries),
  // YouTube (key-gated).
  return [
    createGoogleTrendsRssAdapter(),
    createWeatherAdapter(),
    createSuggestAdapter(),
    createRedditAdapter(),
    createGoogleNewsAdapter(),
    createTiktokCcAdapter(),
    createMetaAdsAdapter(),
    createTrendsIotAdapter(),
    createTrendsRelatedAdapter(),
    createYoutubeAdapter(),
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
  opts: { geo?: string; windowDays?: number; adapters?: SignalAdapter[] } = {},
): Promise<IngestSummary> {
  const geo = opts.geo ?? "US";
  const windowDays = opts.windowDays ?? 7;
  const adapters = opts.adapters ?? defaultAdapters();
  const watchTerms = CATEGORY_CONFIGS.flatMap((c) => c.watchTerms.slice(0, 3));

  // The personalized half of the watchlist: every business's snapshot names
  // the search phrases its real customers use. TRND watches what each
  // business sells — not just its category. The snapshot's watchlist is the
  // backbone (up to 24 terms per business, metro-scoped); the category's
  // stock terms are the floor beneath it.
  const seen = new Set<string>();
  const watch: { term: string; category: string; geo?: string }[] = [];
  const addWatch = (term: string, category: string, termGeo?: string) => {
    const key = term.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    watch.push({ term: key, category, geo: termGeo });
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
      for (const t of (brief?.watch_terms ?? []).slice(0, 24)) addWatch(t, b.category, bizGeo);
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
    try {
      if (!(await adapter.isAvailable())) {
        report.skipped = "unavailable (missing key or open circuit)";
        report.ok = true;
        reports.push(report);
        continue;
      }
      const raw = await adapter.fetch({ terms: watchTerms, watch, places, subreddits, geo, windowDays });
      const rows: NewSignal[] = raw
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
      report.signals = await repo.upsertSignals(rows);
      if (adapter.fetchSeries) {
        const series = await adapter.fetchSeries({ terms: watchTerms, watch, places, subreddits, geo, windowDays });
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
