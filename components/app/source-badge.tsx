import type { SignalSource } from "@/lib/db/types";

const LABELS: Record<SignalSource, string> = {
  google_trends: "Google Trends",
  reddit: "Reddit",
  news: "Google News",
  youtube: "YouTube",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
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
  return (
    <span className={`badge${seed ? " badge--faint" : " badge--mint"}`} title={title}>
      <i />
      {LABELS[source]}
      {metric ? ` · ${metric.replace(/_/g, " ")}` : ""}
    </span>
  );
}
