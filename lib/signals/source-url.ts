import type { SignalSource } from "@/lib/db/types";

/**
 * Where the owner can see a read for themselves. Every "up 22%" the product
 * shows should be one click from the page it was measured on — provenance
 * is part of the product, and a number nobody can check is a vibe.
 */
export interface SourceRef {
  source: SignalSource;
  term: string;
  geo?: string | null;
  raw?: unknown;
}

const SOURCE_NAMES: Record<SignalSource, string> = {
  google_trends: "Google Trends",
  google_suggest: "Google",
  reddit: "Reddit",
  news: "Google News",
  youtube: "YouTube",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
  weather: "the forecast",
  dataforseo: "Google",
  snapshot: "your snapshot",
  seed: "illustrative data",
};

export function sourceName(source: SignalSource): string {
  return SOURCE_NAMES[source];
}

/**
 * What a series' numbers mean. Google's interest index is relative to the
 * term's own peak in the window (peak = 100), so two lines can't be compared
 * by height — only by shape and direction. Say so wherever a line is drawn.
 */
export function scaleNote(source: SignalSource, metric?: string): string | null {
  switch (source) {
    case "google_trends":
    case "dataforseo":
      return "Interest index: 100 = this term's own busiest day in the window. Compare direction and shape across terms, not height.";
    case "snapshot":
      return "Steady-demand index, relative to this term's own peak. A flat line here is normal — it's baseline demand.";
    case "tiktok":
      return "Post volume for this hashtag, relative to its own 30-day peak.";
    case "reddit":
    case "youtube":
      return `${metric ? metric.replace(/_/g, " ") : "Activity"} relative to this term's own 30-day peak.`;
    default:
      return null;
  }
}

export function sourceUrl(ref: SourceRef): string | null {
  const term = ref.term.trim();
  if (!term) return null;
  const q = encodeURIComponent(term);
  // Trends accepts "US" or "US-NC"; anything else falls back to US-wide.
  const geo = ref.geo && /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(ref.geo) ? ref.geo : "US";
  switch (ref.source) {
    case "google_trends": {
      // A widened read was measured on the core term, nationally — link to
      // that page, not to a local one Google will say has no data for.
      const raw = ref.raw as { adjusted?: boolean; measuredTerm?: string; measuredGeo?: string } | null | undefined;
      const mTerm = raw?.adjusted && raw.measuredTerm ? encodeURIComponent(raw.measuredTerm) : q;
      const mGeo = raw?.adjusted && raw.measuredGeo ? raw.measuredGeo : geo;
      return `https://trends.google.com/trends/explore?date=today%201-m&geo=${mGeo}&q=${mTerm}`;
    }
    case "google_suggest":
    case "dataforseo":
      return `https://www.google.com/search?q=${q}`;
    case "reddit":
      return `https://www.reddit.com/search/?q=${q}&sort=new`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${q}`;
    case "news":
      return `https://news.google.com/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    case "tiktok": {
      const tag = (ref.raw as { hashtagName?: unknown } | null | undefined)?.hashtagName;
      return typeof tag === "string" && tag.length > 1
        ? `https://www.tiktok.com/tag/${encodeURIComponent(tag.replace(/^#/, ""))}`
        : `https://www.tiktok.com/search?q=${q}`;
    }
    case "meta_ads":
      return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${q}&search_type=keyword_unordered`;
    case "weather":
    case "snapshot":
    case "seed":
      return null;
  }
}
