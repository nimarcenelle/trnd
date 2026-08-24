import type { Repo } from "@/lib/db/repo";
import type { NewSignal } from "@/lib/db/types";

import { createGoogleNewsAdapter } from "./adapters/google-news";
import { createGoogleTrendsRssAdapter } from "./adapters/google-trends-rss";
import { createRedditAdapter } from "./adapters/reddit";
import { createTrendsIotAdapter } from "./adapters/trends-iot";
import { createYoutubeAdapter } from "./adapters/youtube";
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
  // Trends interest-over-time (fragile), YouTube (key-gated).
  return [
    createGoogleTrendsRssAdapter(),
    createRedditAdapter(),
    createGoogleNewsAdapter(),
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
      const raw = await adapter.fetch({ terms: watchTerms, geo, windowDays });
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
        const series = await adapter.fetchSeries({ terms: watchTerms, geo, windowDays });
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
