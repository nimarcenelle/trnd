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
  x: "X",
  instagram: "Instagram",
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
  x: "X",
  instagram: "Instagram",
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
      // Two different reads share this source: the national hashtag board
      // and the paid per-term one. They are measured in different units and
      // must not describe each other.
      return metric === "shortform_views"
        ? "Views on TikToks posted about this in the last two weeks — this week's against the weeks before."
        : "Post volume for this hashtag, relative to its own 30-day peak.";
    case "youtube":
      return "Views on Shorts posted about this in the last two weeks — this week's against the week before.";
    case "reddit":
      return `${metric ? metric.replace(/_/g, " ") : "Activity"} relative to this term's own 30-day peak.`;
    case "x":
      return "Posts mentioning this in the last seven days, and how far they travelled.";
    case "instagram":
      return "Reels posted under this hashtag in the last seven days.";
    default:
      return null;
  }
}

export function sourceUrl(ref: SourceRef): string | null {
  const term = ref.term.trim();
  if (!term) return null;
  const q = encodeURIComponent(term);
  switch (ref.source) {
    // Search reads do not link. Search volume is Google Ads keyword data
    // with no page anyone can open; the Trends page a claim used to link to
    // shows a different window and scale from the number beside it, and an
    // owner who clicked through and saw "not enough data" stopped trusting
    // every other number on the page. The source is named; nothing is
    // linked that does not show exactly what was measured.
    case "google_trends":
    case "dataforseo":
    case "google_suggest":
      return null;
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
      const raw = ref.raw as { hashtagName?: unknown; top?: { url?: unknown } } | null | undefined;
      // The per-term read captures the actual post doing the work — one tap
      // to the thing being described beats a tag page every time.
      const url = raw?.top?.url;
      if (typeof url === "string" && url.startsWith("https://www.tiktok.com/")) return url;
      const tag = raw?.hashtagName;
      return typeof tag === "string" && tag.length > 1
        ? `https://www.tiktok.com/tag/${encodeURIComponent(tag.replace(/^#/, ""))}`
        : `https://www.tiktok.com/search?q=${q}`;
    }
    case "x":
      // The live conversation, not a profile: what people are posting right
      // now is the thing the read is about.
      return `https://x.com/search?q=${q}&f=live`;
    case "instagram": {
      const tag = (ref.raw as { hashtag?: unknown } | null | undefined)?.hashtag;
      return typeof tag === "string" && tag.length > 1
        ? `https://www.instagram.com/explore/tags/${encodeURIComponent(tag.replace(/^#/, ""))}/`
        : `https://www.instagram.com/explore/tags/${encodeURIComponent(term.replace(/[^a-z0-9]/gi, ""))}/`;
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
