import type { NewPickBundle, PickSignal, Signal, SignalSource, SocialPlatform } from "@/lib/db/types";
import { isCulturalSource } from "@/lib/scoring";
import { geoLabel } from "@/lib/signals/geo";
import { proofName, sourceName, sourceUrl } from "@/lib/signals/source-url";

import { measuredTerm, stripDelta } from "./metric";
import { plainText } from "./schema";

/** A caption that is an ad, not a video someone made: a discount, a sale, a
 * storefront, a link. Nothing a brand should be told to watch. */
export function looksLikeSalePost(title: string, channel = ""): boolean {
  const t = `${title} ${channel}`.toLowerCase();
  return /\b\d{1,2}\s?%\s?off\b|flash sale|\bsale\b.*\boff\b|shop now|link in bio|discount code|promo code|free shipping|https?:\/\/|\bwww\.|\.(com|shop|store|co)\b|【|】/i.test(t);
}

/**
 * The evidence rows under a pick, one fact per row, grouped by the four
 * signals. Built from facts the weekly job already loaded, never written by
 * a model, so every claim traces to something the brand can open.
 *
 * Two rules shape every builder here:
 * - A signal with nothing behind it produces no rows. Silence is the correct
 *   representation of an absent signal; "no rival data yet" is noise.
 * - A claim never repeats the pick's metric figure. The number appears once
 *   on the page, in the metric, and a claim that says it again makes the
 *   two look like separate findings.
 */

export type NewEvidence = NewPickBundle["evidence"][number];

type SignalRef = Pick<Signal, "source" | "term" | "geo" | "raw" | "metric_type"> & { captured_at?: string | null };

/** yyyy-mm-dd from a timestamp, or null. */
export function observedDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * What each kind of row cannot say. These are the evidence boundaries the
 * page prints under every claim; the writer never sees or edits them.
 */
export const LIMITS = {
  search: "Search demand is context. It does not show how a paid-social ad on this will perform.",
  suggest: "Autocomplete shows people type this. It says nothing about how many, or what they buy.",
  reddit: "A few posts are a small sample, not a survey of your customers.",
  news: "Coverage counts say what outlets wrote about, not what customers want.",
  weather: "A forecast-derived rule of thumb, not a measurement of demand.",
  seed: "Sample data. Not a real read.",
  shortform: "One video's views show what an audience watched, not what your customers buy.",
  board: "A national board for the industry, not your customers.",
  rivalAd: "Observed running. Running does not mean it works, and its claims may not fit your customer.",
  rivalPost: "One post from a rival is what they chose to say, not what worked.",
  adCount: "A count of ads that mention the phrase, not a read of what they say.",
  ownPost: "Engagement on one post against your usual. Not purchase data.",
  ownHistory: "Click-through on past ads against your account average. Not purchase data unless your export carried results.",
  profile: "From the customer profile TRND wrote from your site, not from a survey.",
  comments: "Real comments, quoted as written. A handful of people, not the audience.",
  reviews: "Real reviews, quoted as written. Self-selected, not a sample of buyers.",
} as const;

export interface EvidenceFacts {
  term: string;
  /** The pick's own read. */
  signal: SignalRef;
  /** The pick's metric delta: its direction words a claim, its figure is kept out. */
  deltaPct: number | null;
  online: boolean;
  /** The target customer's phrase this term matched (explainOpportunity). */
  audiencePhrase: string | null;
  /** The short-form read on the term: the pick's own signal when it is one. */
  shortform: SignalRef | null;
  /** Direct rivals' Meta ads that mention the term. */
  rivalAds: { rival: string; text: string; url: string | null; runningDays: number | null }[];
  /** Direct rivals' posts on the term, best first. */
  rivalPosts: { rival: string; caption: string; url: string | null; platform: SocialPlatform }[];
  /** The keyword ad read on the term, after the relevance check. */
  adLibrary: { source: SignalSource; term: string; advertisers: string[]; count: number | null } | null;
  /** The brand's own best-performing ad theme (bestTheme). */
  ownBestTheme: { theme: string; vsAccount: number; ads: number } | null;
  /** historyOnTerm's reason, only when it compared real numbers. */
  ownHistoryOnTerm: string | null;
  /** The brand's own post on the term that beat its usual. */
  ownPost: { caption: string; url: string | null; platform: SocialPlatform; engagement: number } | null;
  /** How many of the brand's own posts were read, for the sample size. */
  ownPostsRead?: number;
  /** Real customer comments that mention the term, as written. */
  comments?: { total: number; onTerm: { text: string; postedAt: string | null; where: "yours" | "rival" }[] };
  /** Real reviews of the brand that mention the term, as written. */
  reviews?: { total: number; onTerm: { text: string; rating: number; publishedAt: string | null }[] };
  /** When the rival ad reads were captured. */
  rivalAdsObservedOn?: string | null;
}

const PER_SIGNAL_MAX = 3;

const THEME_WORDS: Record<string, string> = {
  education: "teaching something",
  offer: "a price or a deal",
  scarcity: "a deadline",
  social_proof: "customer proof",
  speed: "speed and convenience",
  novelty: "something new",
};

const SHORTFORM_NAMES: Partial<Record<SignalSource, string>> = {
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
  instagram: "Instagram Reels",
  x: "X",
};

const SOCIAL_NAMES: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

/** Quoted copy, cut on a word so it never ends mid-word. Inner double
 * quotes become single so the claim's own quotes stay balanced. */
function quote(text: string, max = 100): string {
  const t = text.replace(/\s+/g, " ").replace(/"/g, "'").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function direction(deltaPct: number | null): string | null {
  if (typeof deltaPct !== "number" || !Number.isFinite(deltaPct)) return null;
  return deltaPct >= 5 ? "rising" : deltaPct <= -5 ? "falling" : "holding steady";
}

function row(
  signal: PickSignal,
  claim: string,
  source_url: string | null,
  source_label: string | null,
  prov: { kind?: NewEvidence["kind"]; observed_on?: string | null; sample_size?: number | null; limitation?: string | null } = {},
): NewEvidence {
  return {
    signal,
    claim,
    source_url,
    source_label,
    kind: prov.kind ?? "observation",
    observed_on: prov.observed_on ?? null,
    sample_size: prov.sample_size ?? null,
    limitation: prov.limitation ?? null,
  };
}

/* -------------------------------- customer -------------------------------- */

function customerRows(f: EvidenceFacts): NewEvidence[] {
  const rows: NewEvidence[] = [];
  const s = f.signal;
  // A short-form or ad read is culture or competition, not the customer.
  if (!isCulturalSource(s) && s.source !== "meta_ads") {
    const measured = measuredTerm(s);
    const widened = measured.toLowerCase() !== f.term.trim().toLowerCase();
    const subject = widened
      ? `Searches for "${measured}", the closest phrase Google can measure for "${f.term}",`
      : `Searches for "${f.term}"`;
    const where = f.online || !/^US-/.test(s.geo) ? "across the US" : `in ${geoLabel(s.geo)}`;
    const moving = direction(f.deltaPct);
    // The link opens the page the read can be checked on. An evergreen watch
    // term's series is Google's interest line, so it links there too.
    const linkSource: SignalSource = s.source === "snapshot" ? "google_trends" : s.source;
    const url = sourceUrl({ source: linkSource, term: s.term, geo: s.geo, raw: s.raw });
    const label = proofName(linkSource) ?? sourceName(linkSource);
    let claim: string | null = null;
    let limitation: string = LIMITS.search;
    let kind: NewEvidence["kind"] = "measurement";
    switch (s.source) {
      case "google_trends":
      case "dataforseo":
        claim = moving ? `${subject} are ${moving} ${where}.` : `People search for "${f.term}" ${where}.`;
        break;
      case "snapshot":
        // A watch term with no measured movement is the brief's guess, not a
        // read anyone can check. Only a measured line earns a row.
        claim = moving ? `${subject} are ${moving} ${where}.` : null;
        break;
      case "google_suggest":
        claim = `"${f.term}" shows up in Google autocomplete, so people are typing it.`;
        limitation = LIMITS.suggest;
        kind = "observation";
        break;
      case "reddit":
        claim = `People on Reddit are posting about "${f.term}".`;
        limitation = LIMITS.reddit;
        kind = "observation";
        break;
      case "news":
        claim = `News outlets are covering "${f.term}" right now.`;
        limitation = LIMITS.news;
        kind = "observation";
        break;
      case "weather": {
        const detail = (s.raw as { detail?: unknown } | null)?.detail;
        claim = typeof detail === "string" && detail.trim() ? detail.trim() : null;
        limitation = LIMITS.weather;
        kind = "context";
        break;
      }
      case "seed":
        claim = `Sample data shows interest in "${f.term}" ${moving ?? "holding steady"}.`;
        limitation = LIMITS.seed;
        kind = "context";
        break;
    }
    if (claim) {
      rows.push(
        row("customer", claim, url, s.source === "seed" ? "Sample data" : label, {
          kind,
          observed_on: observedDay(s.captured_at),
          limitation,
        }),
      );
    }
  }
  // Real words first: a comment or a review that names the term is the one
  // customer row a writer can quote without inventing anything.
  const comments = f.comments;
  if (comments && comments.onTerm.length > 0) {
    const first = comments.onTerm[0];
    const n = comments.onTerm.length;
    rows.push(
      row(
        "customer",
        `${n} of ${comments.total} comments read under ${first.where === "yours" ? "your" : "your rivals'"} posts mention this. One, as written: "${quote(first.text, 140)}".`,
        null,
        "Comments",
        { kind: "quote", observed_on: observedDay(first.postedAt), sample_size: comments.total, limitation: LIMITS.comments },
      ),
    );
  }
  const reviews = f.reviews;
  if (reviews && reviews.onTerm.length > 0) {
    const first = reviews.onTerm[0];
    rows.push(
      row(
        "customer",
        `${reviews.onTerm.length} of ${reviews.total} reviews of you mention this. One, ${first.rating} stars, as written: "${quote(first.text, 140)}".`,
        null,
        "Your reviews",
        { kind: "quote", observed_on: observedDay(first.publishedAt), sample_size: reviews.total, limitation: LIMITS.reviews },
      ),
    );
  }
  if (f.audiencePhrase) {
    const same = f.audiencePhrase.trim().toLowerCase() === f.term.trim().toLowerCase();
    rows.push(
      row(
        "customer",
        same
          ? `"${f.term}" is already how your target customer says it.`
          : `Your target customer says it as "${quote(f.audiencePhrase, 60)}".`,
        null,
        "Your customer profile",
        { kind: "context", limitation: LIMITS.profile },
      ),
    );
  }
  return rows;
}

/* --------------------------------- culture -------------------------------- */

function cultureRows(f: EvidenceFacts): NewEvidence[] {
  const s = f.shortform;
  if (!s) return [];
  const raw = (s.raw ?? {}) as {
    top?: { title?: unknown; channel?: unknown } | null;
    breakout?: { title?: unknown; channel?: unknown } | null;
    hashtagName?: unknown;
    medianDurationSec?: unknown;
  };
  const platform = SHORTFORM_NAMES[s.source] ?? sourceName(s.source);
  const url = sourceUrl({ source: s.source, term: s.term, geo: s.geo, raw: s.raw });
  const label = proofName(s.source) ?? sourceName(s.source);
  const rows: NewEvidence[] = [];
  // The most-viewed video on a term is often a dropshipper's sale post
  // ("FLASH SALE 50% off, say goodbye to itchy scalp" from angelgode.com):
  // quoted as "the video pulling the most views" it reads as a
  // recommendation. A sale post is skipped for the breakout, then for the
  // plain line.
  const clean = (card: { title?: unknown; channel?: unknown } | null | undefined) => {
    const t = typeof card?.title === "string" ? card.title.trim() : "";
    const c = typeof card?.channel === "string" ? card.channel.trim() : "";
    return t && !looksLikeSalePost(t, c) ? { title: t, channel: c } : null;
  };
  const card = clean(raw.top) ?? clean(raw.breakout);
  const title = card?.title ?? "";
  const channel = card?.channel ?? "";
  const tag = typeof raw.hashtagName === "string" ? raw.hashtagName.replace(/^#/, "").trim() : "";
  const prov = { observed_on: observedDay(s.captured_at) };
  if (title) {
    rows.push(
      row(
        "culture",
        `The ${platform} video pulling the most views on "${f.term}" is "${quote(title, 90)}"${channel ? ` from ${channel}` : ""}.`,
        url,
        label,
        { ...prov, kind: "observation", limitation: LIMITS.shortform },
      ),
    );
  } else if (tag && s.metric_type !== "shortform_views") {
    rows.push(row("culture", `#${tag} is on TikTok's trending board for your industry.`, url, label, { ...prov, kind: "context", limitation: LIMITS.board }));
  } else {
    rows.push(row("culture", `${platform} creators are posting about "${f.term}" this week.`, url, label, { ...prov, kind: "observation", limitation: LIMITS.shortform }));
  }
  if (typeof raw.medianDurationSec === "number" && raw.medianDurationSec > 0) {
    rows.push(
      row("culture", `The ${platform} videos winning on this run about ${Math.round(raw.medianDurationSec)} seconds.`, url, label, {
        ...prov,
        kind: "measurement",
        limitation: "The length of videos people watched on this, not the length your ad needs.",
      }),
    );
  }
  return rows;
}

/* ------------------------------- competitive ------------------------------ */

const adLibraryPageSearch = (name: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(name)}&search_type=page`;

function competitiveRows(f: EvidenceFacts): NewEvidence[] {
  const rows: NewEvidence[] = [];
  for (const ad of f.rivalAds.slice(0, 2)) {
    const weeks = typeof ad.runningDays === "number" && ad.runningDays >= 21 ? Math.floor(ad.runningDays / 7) : 0;
    rows.push(
      row(
        "competitive",
        weeks > 0
          ? `${ad.rival} had a Meta ad on this that had been running ${weeks} weeks when read: "${quote(ad.text)}".`
          : `${ad.rival} had a Meta ad on this running when read: "${quote(ad.text)}".`,
        ad.url ?? adLibraryPageSearch(ad.rival),
        "Meta Ad Library",
        { kind: "quote", observed_on: f.rivalAdsObservedOn ?? null, limitation: LIMITS.rivalAd },
      ),
    );
  }
  for (const post of f.rivalPosts.slice(0, Math.max(0, PER_SIGNAL_MAX - rows.length)).slice(0, 1)) {
    const platform = SOCIAL_NAMES[post.platform];
    rows.push(
      row("competitive", `${post.rival} posted about this on ${platform}: "${quote(post.caption)}".`, post.url, platform, {
        kind: "quote",
        limitation: LIMITS.rivalPost,
      }),
    );
  }
  // The keyword read stands in only when no named rival said anything: it is
  // the whole market, and the named rivals are the sharper fact.
  if (rows.length === 0 && f.adLibrary) {
    const url = sourceUrl({ source: f.adLibrary.source, term: f.adLibrary.term });
    const label = proofName(f.adLibrary.source) ?? sourceName(f.adLibrary.source);
    const names = f.adLibrary.advertisers.slice(0, 2);
    if (names.length > 0) {
      const who = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0];
      rows.push(
        row("competitive", `${who} already run${names.length === 1 ? "s" : ""} Meta ads that mention "${f.term}".`, url, label, {
          kind: "observation",
          sample_size: f.adLibrary.count,
          limitation: LIMITS.adCount,
        }),
      );
    } else if (f.adLibrary.count === 0) {
      rows.push(
        row("competitive", `No active Meta ads mentioning "${f.term}" were found when read.`, url, label, {
          kind: "observation",
          sample_size: 0,
          limitation: "A keyword search of the Ad Library. Ads that say it differently would not show.",
        }),
      );
    }
  }
  return rows;
}

/* ---------------------------------- brand --------------------------------- */

function brandRows(f: EvidenceFacts): NewEvidence[] {
  const rows: NewEvidence[] = [];
  if (f.ownPost) {
    const platform = SOCIAL_NAMES[f.ownPost.platform];
    rows.push(
      row(
        "brand",
        `Your ${platform} post on this got ${f.ownPost.engagement.toLocaleString("en-US")} likes, comments and shares: "${quote(f.ownPost.caption)}".`,
        f.ownPost.url,
        platform,
        { kind: "measurement", sample_size: f.ownPostsRead ?? null, limitation: LIMITS.ownPost },
      ),
    );
  }
  if (f.ownHistoryOnTerm) rows.push(row("brand", `${cap(f.ownHistoryOnTerm)}.`, null, "Your ad account", { kind: "measurement", limitation: LIMITS.ownHistory }));
  const best = f.ownBestTheme;
  if (best && best.vsAccount >= 1.1) {
    rows.push(
      row(
        "brand",
        `Your ads built on ${THEME_WORDS[best.theme] ?? best.theme.replace(/_/g, " ")} ran ${Math.round((best.vsAccount - 1) * 100)}% above your account average across ${best.ads} ads.`,
        null,
        "Your ad account",
        { kind: "measurement", sample_size: best.ads, limitation: LIMITS.ownHistory },
      ),
    );
  }
  return rows;
}

export function buildEvidence(facts: EvidenceFacts): NewEvidence[] {
  return [customerRows(facts), cultureRows(facts), competitiveRows(facts), brandRows(facts)]
    .flatMap((rows) => rows.slice(0, PER_SIGNAL_MAX))
    .map((r) => ({ ...r, claim: plainText(stripDelta(r.claim, facts.deltaPct)) }))
    .filter((r) => r.claim.length >= 10);
}
