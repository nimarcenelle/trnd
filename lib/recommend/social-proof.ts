import type { Signal } from "@/lib/db/types";
import { sourceUrl } from "@/lib/signals/source-url";

/**
 * What short-form says about this term — the evidence an owner sweeps
 * before believing the grade.
 *
 * Split deliberately into FACTS and EXAMPLES, because they have different
 * reliability and pretending otherwise is how this panel would lie.
 *
 * The aggregate facts are sound: median length, engagement rate and repeat
 * creators are computed over the whole week's sample, and a global sample
 * does not distort them — a 20-second median is a 20-second median whoever
 * shot the videos.
 *
 * The individual examples are not sound for globally-popular consumer
 * terms. Live validation of "cold plunge" returned challenge and reaction
 * content in three languages; after gating on engagement the top video was
 * still romanized Hindi, which no script filter catches and no Atlanta
 * studio can act on. So examples are shown only when they pass the
 * business-context check, and the panel stands on its facts without them.
 */

export interface SocialFact {
  label: string;
  value: string;
}

export interface SocialExample {
  title: string;
  channel: string;
  href: string;
  meta: string;
}

export interface SocialProof {
  /** "YouTube Shorts", "TikTok" — whichever actually measured this. */
  platforms: string[];
  facts: SocialFact[];
  examples: SocialExample[];
  /** Null when no short-form read exists at all for this term. */
  summary: string | null;
  /** Where to go and see it — always a SHORT-FORM page. The page used to
   * fall back to the pick's own signal here, which for a search-led pick is
   * Google Trends: a "what short-form says" panel linking to a search chart. */
  href: string | null;
}

interface ShortformRaw {
  uploads?: number;
  engagementPct?: number | null;
  actionPct?: number | null;
  medianDurationSec?: number | null;
  repeatChannels?: string[];
  hashtags?: string[];
  top?: { id?: string; title?: string; channel?: string; views?: number } | null;
  breakout?: { id?: string; title?: string; channel?: string; views?: number } | null;
  vetted?: boolean;
}

const PLATFORM: Record<string, string> = { youtube: "YouTube Shorts", tiktok: "TikTok" };

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

export function buildSocialProof(signals: Signal[]): SocialProof {
  const shortform = signals.filter((s) => s.metric_type === "shortform_views");
  if (shortform.length === 0) {
    return { platforms: [], facts: [], examples: [], summary: null, href: null };
  }

  const platforms = [...new Set(shortform.map((s) => PLATFORM[s.source] ?? s.source))];
  const facts: SocialFact[] = [];
  const examples: SocialExample[] = [];
  let views = 0;
  let uploads = 0;

  for (const s of shortform) {
    const raw = (s.raw ?? {}) as ShortformRaw;
    views += Number(s.value) || 0;
    uploads += typeof raw.uploads === "number" ? raw.uploads : 0;

    if (typeof raw.medianDurationSec === "number" && !facts.some((f) => f.label === "Length that wins")) {
      facts.push({ label: "Length that wins", value: `${Math.round(raw.medianDurationSec)} seconds` });
    }
    if (typeof raw.engagementPct === "number" && !facts.some((f) => f.label === "Reaction rate")) {
      facts.push({
        label: "Reaction rate",
        value: `${raw.engagementPct}% of views like or comment`,
      });
    }
    if (typeof raw.actionPct === "number" && raw.actionPct > 0 && !facts.some((f) => f.label === "Share rate")) {
      facts.push({ label: "Share rate", value: `${raw.actionPct}% share or save it` });
    }
    if ((raw.repeatChannels ?? []).length > 0 && !facts.some((f) => f.label === "Being worked by")) {
      facts.push({
        label: "Being worked by",
        value: `${raw.repeatChannels!.slice(0, 2).join(", ")} — posting more than once a week on it`,
      });
    }
    if ((raw.hashtags ?? []).length > 0 && !facts.some((f) => f.label === "Tagged with")) {
      facts.push({
        label: "Tagged with",
        value: raw.hashtags!.slice(0, 4).map((h) => `#${h}`).join(" "),
      });
    }

    // Examples only when the per-business pass vouched for them. Unvetted
    // examples are the exact failure the module header describes.
    if (raw.vetted) {
      for (const v of [raw.top, raw.breakout]) {
        if (!v?.title || !v.id) continue;
        if (examples.some((e) => e.title === v.title)) continue;
        const href = sourceUrl({ ...s, raw });
        if (!href) continue;
        examples.push({
          title: v.title,
          channel: v.channel ?? "",
          href,
          meta: typeof v.views === "number" ? `${compact(v.views)} views` : "",
        });
      }
    }
  }

  if (views > 0) {
    facts.unshift({
      label: "Watched this week",
      value: `${compact(views)} views across ${uploads || "the"} new video${uploads === 1 ? "" : "s"}`,
    });
  }

  const summary =
    views > 0
      ? `${platforms.join(" and ")} measured ${compact(views)} views on this in the last seven days.`
      : `${platforms.join(" and ")} carried this term this week, but pulled no measurable views.`;

  // The first short-form signal that can name a page — never the pick's.
  const href = shortform.map((s) => sourceUrl(s)).find((u): u is string => Boolean(u)) ?? null;
  return { platforms, facts, examples, summary, href };
}
