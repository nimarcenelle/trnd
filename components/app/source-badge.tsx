import type { SignalSource } from "@/lib/db/types";
import { metricLabel as labelForMetric, proofName, sourceUrl } from "@/lib/signals/source-url";

const LABELS: Record<SignalSource, string> = {
  google_trends: "Google Trends",
  google_suggest: "Google Autocomplete",
  reddit: "Reddit",
  news: "Google News",
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
  weather: "Weather forecast",
  dataforseo: "Search volume",
  snapshot: "Your snapshot",
  seed: "Illustrative",
};

/**
 * Where a signal came from — provenance is part of the product. Given the
 * term (or an explicit href) the badge links to the page the read was taken
 * from, so every number is one click from its source.
 */
export default function SourceBadge({
  source,
  metric,
  term,
  geo,
  raw,
  href,
}: {
  source: SignalSource;
  metric?: string;
  term?: string;
  geo?: string | null;
  raw?: unknown;
  href?: string | null;
}) {
  const seed = source === "seed";
  const link = href ?? (term ? sourceUrl({ source, term, geo, raw }) : null);
  const title =
    source === "seed"
      ? "Seeded example data — becomes live signal once ingestion runs with network access"
      : source === "snapshot"
        ? "A demand term from your founding analysis, watched daily"
        : link
          ? // The destination, not the label — "Open this read on Search
            // volume" tells nobody where they're going.
            `See it for yourself on ${proofName(source) ?? LABELS[source]}`
          : `Captured from ${LABELS[source]}`;
  // "Search volume · search volume" (dataforseo's metric IS its label) reads
  // as a glitch, and so does "YouTube Shorts · views on Shorts" — only show
  // the metric when it adds something the source name didn't.
  const metricLabel = metric ? labelForMetric(metric) : undefined;
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const sourceWords = new Set(words(LABELS[source]));
  // Any shared word means the metric is restating the source: "YouTube
  // Shorts · views on Shorts", "Search volume · search volume".
  const showMetric = metricLabel ? !words(metricLabel).some((w) => sourceWords.has(w)) : false;
  const body = (
    <>
      <i />
      {LABELS[source]}
      {showMetric ? ` · ${metricLabel}` : ""}
      {link && <span className="src-arrow" aria-hidden="true">↗</span>}
    </>
  );
  const cls = `badge${seed ? " badge--faint" : " badge--mint"}`;
  if (!link) {
    return (
      <span className={cls} title={title}>
        {body}
      </span>
    );
  }
  return (
    <a className={`${cls} badge--link`} href={link} target="_blank" rel="noopener noreferrer" title={title}>
      {body}
    </a>
  );
}
