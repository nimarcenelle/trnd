import type { SignalSource } from "@/lib/db/types";

const LABELS: Record<SignalSource, string> = {
  google_trends: "Google Trends",
  google_suggest: "Google Autocomplete",
  reddit: "Reddit",
  news: "Google News",
  youtube: "YouTube",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
  weather: "Weather forecast",
  dataforseo: "Search volume",
  snapshot: "Your snapshot",
  seed: "Illustrative",
};

/** Where a signal came from — provenance is part of the product. */
export default function SourceBadge({
  source,
  metric,
}: {
  source: SignalSource;
  metric?: string;
}) {
  const seed = source === "seed";
  const title =
    source === "seed"
      ? "Seeded example data — becomes live signal once ingestion runs with network access"
      : source === "snapshot"
        ? "A demand term from your founding analysis, watched daily"
        : `Captured from ${LABELS[source]}`;
  // "Search volume · search volume" (dataforseo's metric IS its label) reads
  // as a glitch — only show the metric when it adds something.
  const metricLabel = metric?.replace(/_/g, " ");
  const showMetric = metricLabel && metricLabel.toLowerCase() !== LABELS[source].toLowerCase();
  return (
    <span className={`badge${seed ? " badge--faint" : " badge--mint"}`} title={title}>
      <i />
      {LABELS[source]}
      {showMetric ? ` · ${metricLabel}` : ""}
    </span>
  );
}
