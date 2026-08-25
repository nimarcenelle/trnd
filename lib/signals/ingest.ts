import type { Repo } from "@/lib/db/repo";
import type { NewSignal } from "@/lib/db/types";

import { weekOf } from "@/lib/recommend/recommend";

import { createGoogleNewsAdapter } from "./adapters/google-news";
import { createGoogleTrendsRssAdapter } from "./adapters/google-trends-rss";
import { createRedditAdapter } from "./adapters/reddit";
import { createTiktokCcAdapter } from "./adapters/tiktok-cc";
import { createTrendsIotAdapter } from "./adapters/trends-iot";
import { createYoutubeAdapter } from "./adapters/youtube";
import { createMetaAdsAdapter } from "./adlibrary";
import { CATEGORY_CONFIGS } from "./category-terms";
import { normalizeTerm } from "./normalize";
import type { AdapterRunReport, SignalAdapter } from "./types";

export interface IngestSummary {
  day: string;
  reports: AdapterRunReport[];
  totalSignals: number;
  totalSeriesPoints: number;
}

function defaultAdapters(): SignalAdapter[] {
  // Order per the brief: RSS first (most reliable), then Reddit, News,
  // TikTok Creative Center (unofficial, per-industry), Trends
  // interest-over-time (fragile), YouTube (key-gated).
  return [
    createGoogleTrendsRssAdapter(),
    createRedditAdapter(),
    createGoogleNewsAdapter(),
    createTiktokCcAdapter(),
    createMetaAdsAdapter(),
    createTrendsIotAdapter(),
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
  const watchTerms = CATEGORY_CONFIGS.flatMap((c) => c.watchTerms.slice(0, 2));

  // The personalized half of the watchlist: every business's snapshot names
  // the search phrases its real customers use. TRND watches what each
  // business sells — not just its category.
  const seen = new Set<string>();
  const watch: { term: string; category: string; geo?: string }[] = [];
  const addWatch = (term: string, category: string, termGeo?: string) => {
    const key = term.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    watch.push({ term: key, category, geo: termGeo });
  };
  for (const c of CATEGORY_CONFIGS) for (const t of c.watchTerms.slice(0, 2)) addWatch(t, c.category);
  try {
    const week = weekOf();
    for (const b of await repo.listAllBusinesses()) {
      const brief = await repo.getBusinessBrief(b.id);
      // A business's own terms watch its own state, not the whole country.
      // ("US" still marks the term as business-scoped for the ad-library read.)
      const stateGeo = b.region ? `US-${b.region.toUpperCase()}` : "US";
      for (const t of (brief?.watch_terms ?? []).slice(0, 8)) addWatch(t, b.category, stateGeo);
      // This week's ranked terms too — so their saturation read is real.
      for (const o of (await repo.listOpportunities(b.id, week)).slice(0, 5)) {
        const sig = await repo.getSignal(o.signal_id);
        if (sig) addWatch(`${sig.term} ${b.city}`, b.category, stateGeo);
      }
    }
  } catch (err) {
    console.warn("[ingest] business watchlist unavailable:", (err as Error).message);
  }

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
      const raw = await adapter.fetch({ terms: watchTerms, watch, geo, windowDays });
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
        const series = await adapter.fetchSeries({ terms: watchTerms, watch, geo, windowDays });
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
