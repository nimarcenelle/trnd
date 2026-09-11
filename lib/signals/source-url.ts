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
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
  weather: "the forecast",
  dataforseo: "Google",
  snapshot: "your snapshot",
  seed: "sample data",
};

/**
 * Where a link actually lands. Not the same as the source label: a search
 * volume read is measured by one vendor and verified on another's public
 * page, and the owner deserves to be told which page they're about to open.
 */
const PROOF_NAMES: Partial<Record<SignalSource, string>> = {
  google_trends: "Google Trends",
  google_suggest: "Google Trends",
  dataforseo: "Google Trends",
  reddit: "Reddit",
  news: "Google News",
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  meta_ads: "Meta Ad Library",
};

/**
 * A metric said the way the owner would say it. `metric_type` is a column
 * name — "shortform_views" on a badge reads like a database leak, and the
 * screens that print it raw were all doing the same `replace(/_/g, " ")`.
 */
const METRIC_LABELS: Record<string, string> = {
  shortform_views: "views on Shorts",
  search_volume: "search volume",
  conversation: "posts",
  video_volume: "videos posted",
  local_demand: "local demand",
  weather_trigger: "weather window",
  ad_count: "competing ads",
  coverage: "local coverage",
};

export function metricLabel(metric: string | null | undefined): string {
  if (!metric) return "activity";
  return METRIC_LABELS[metric] ?? metric.replace(/_/g, " ");
}

export function proofName(source: SignalSource): string | null {
  return PROOF_NAMES[source] ?? null;
}

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
      return "Interest index: 100 = this term's own busiest day in the window. Compare direction and shape across terms, not height.";
    case "dataforseo":
      // Not an index — these are real monthly searches, so say so. Calling
      // absolute volume an index is the kind of small lie that costs trust
      // the moment someone opens the source.
      return "Monthly Google searches for this term, as counted by Google Ads keyword data. Absolute volume, not an index.";
    case "snapshot":
      return "Steady-demand index, relative to this term's own peak. A flat line here is normal — it's baseline demand.";
    case "tiktok":
      return "Post volume for this hashtag, relative to its own 30-day peak.";
    case "youtube":
      return "Views on Shorts posted about this in the last two weeks — this week's against the week before.";
    case "reddit":
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
    case "dataforseo": {
      // Search volume is Google Ads keyword data (via DataForSEO), which has
      // no page anyone can open. A results page proves nothing — it's the
      // same ten blue links whether demand doubled or died. Trends plots the
      // same demand over a year, free, so the climb we're claiming is on
      // screen within a second of the click.
      //
      // Nationally, though: the volume was measured for the whole country,
      // and a state-level Trends page for a long-tail term answers "not
      // enough data" — a link that argues against the number it's proving.
      const country = geo.slice(0, 2);
      return `https://trends.google.com/trends/explore?date=today%2012-m&geo=${country}&q=${q}`;
    }
    case "google_suggest":
      // Autocomplete means people are typing it. The proof of that is the
      // curve, not a search page — and, like the volume read, autocomplete is
      // pulled nationally (gl=us), so the link shows the country it measured.
      return `https://trends.google.com/trends/explore?date=today%203-m&geo=${geo.slice(0, 2)}&q=${q}`;
    case "reddit":
      return `https://www.reddit.com/search/?q=${q}&sort=new`;
    case "youtube": {
      // The strongest proof of short-form attention is the Short itself —
      // the one pulling the views this week, watchable in one tap. The
      // results page is the fallback when we didn't capture one.
      const top = (ref.raw as { top?: { id?: unknown } } | null | undefined)?.top;
      const id = typeof top?.id === "string" ? top.id : null;
      return id ? `https://www.youtube.com/shorts/${encodeURIComponent(id)}` : `https://www.youtube.com/results?search_query=${q}`;
    }
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

/**
 * What window a source's delta actually covers. Search volume arrives as
 * monthly totals, so calling its move "vs last week" is a claim the number
 * can't back — and a reader who opens the source finds months, not days.
 */
export function deltaWindowLabel(source: SignalSource): string {
  return source === "dataforseo" ? "vs last month" : "vs last week";
}
