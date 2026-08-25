import type { SignalSource } from "@/lib/db/types";

const LABELS: Record<SignalSource, string> = {
  google_trends: "Google Trends",
  reddit: "Reddit",
  news: "Google News",
  youtube: "YouTube",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
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
  return (
    <span
      className={`badge${seed ? " badge--faint" : " badge--mint"}`}
      title={seed ? "Seeded example data — becomes live signal once ingestion runs with network access" : `Captured from ${LABELS[source]}`}
    >
      <i />
      {LABELS[source]}
      {metric ? ` · ${metric.replace(/_/g, " ")}` : ""}
    </span>
  );
}
