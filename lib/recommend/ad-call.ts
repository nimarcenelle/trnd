import { withoutArticle } from "@/lib/text";
import type { TargetCustomer } from "@/lib/db/types";
import type { RivalTermRead, SignalReasons, SignalScores } from "@/lib/scoring";

/**
 * The call. Everything TRND reads ends in one instruction an owner can act
 * on without opening anything else:
 *
 *   Run this ad.
 *   Promote the Gold Rush latte ($6.75) to remote workers near Glenwood on Reels.
 *   Angle: …
 *   Format: 20-second vertical video: the problem, the demonstration, the answer.
 *   Why: searches up 34% in Atlanta, 1 of 5 direct rivals on it, your
 *        education ads ran 38% above your account average.
 *   Here are 3 scripts to test.
 *
 * Pure. Every clause is built from a number already on the page; a clause
 * with nothing real behind it is left out, never filled.
 */

export type AdVerdict = "run" | "small" | "skip";

/** Grade bands on the 0-10 score (lib/scoring/model.ts): B+ and up is worth
 * running, C and B are worth a small test, and a Hold is held. SMALL_AT is
 * the same bar the auto-build uses (lib/campaigns/auto.ts). */
const SMALL_AT = 5;
const RUN_AT = 7;

export interface AdCallInput {
  term: string;
  score: number;
  signals?: SignalScores;
  signalReasons?: SignalReasons;
  service: { name: string; price_cents: number | null } | null;
  targetCustomer: TargetCustomer | null;
  /** The written campaign, when there is one. */
  campaign: {
    angle: string;
    hook: string;
    offer: string;
    audience: { who: string; age_range?: string | null; angle_type?: string | null };
  } | null;
  scripts: string[];
  /** Where the attention is: the short-form platform that measured the term,
   * how much of the owner's own feed is video. */
  culturalPlatform: string | null;
  ownVideoShare: number | null;
  /** Where the brand already runs ads (Business.ad_platforms). An ad is
   * recommended where they can actually buy it this week. */
  adPlatforms?: string[];
  /** How the winning short-form on this term is built. */
  medianDurationSec: number | null;
  weekPct: number | null;
  monthPct: number | null;
  /** "Atlanta metro", "Georgia". */
  geoLabel: string;
  audiencePhrase: string | null;
  rivals: RivalTermRead | null;
  /** What the direct rivals' ads lean on, most common first. */
  rivalThemes: { theme: string; count: number }[];
  /** The owner's own best-performing ad theme. */
  ownBestTheme: { theme: string; vsAccount: number; ads: number } | null;
}

export interface AdCall {
  verdict: AdVerdict;
  headline: string;
  /** "Promote X to Y on Z." */
  promote: string;
  angle: string | null;
  format: string;
  why: string[];
  scripts: string[];
}

function money(cents: number | null): string | null {
  if (typeof cents !== "number" || cents <= 0) return null;
  const d = cents / 100;
  return d % 1 === 0 ? `$${d}` : `$${d.toFixed(2)}`;
}

const THEME_WORDS: Record<string, string> = {
  education: "teaching something",
  offer: "a price or deal",
  scarcity: "a deadline or limited run",
  social_proof: "customer proof",
  speed: "speed and convenience",
  novelty: "something new",
};

/** Beats per persuasion shape, said the way a person briefs a shoot. */
const STRUCTURE: Record<string, string> = {
  offer: "the thing, the price, where to get it",
  education: "the problem, a quick demonstration, the answer",
  social_proof: "a customer's own line, the thing, the offer",
  scarcity: "the moment, the thing, when it ends",
  speed: "the problem, how fast you fix it, how to book",
  novelty: "the reveal, the first taste or first look, where to get it",
};

function platformFor(input: Pick<AdCallInput, "culturalPlatform" | "ownVideoShare" | "adPlatforms">): string {
  const buys = new Set(input.adPlatforms ?? []);
  if (buys.size > 0) {
    // Where the attention is, narrowed to where they already buy.
    if (input.culturalPlatform === "tiktok" && buys.has("tiktok")) return buys.has("meta") ? "TikTok and Instagram Reels" : "TikTok";
    if (input.culturalPlatform === "youtube" && buys.has("youtube")) return buys.has("meta") ? "Instagram Reels and YouTube Shorts" : "YouTube Shorts";
    if (buys.has("meta")) return "Instagram Reels and Facebook";
    if (buys.has("tiktok")) return "TikTok";
  }
  switch (input.culturalPlatform) {
    case "tiktok":
      return "TikTok and Instagram Reels";
    case "youtube":
      return "Instagram Reels and YouTube Shorts";
    case "instagram":
      return "Instagram Reels";
  }
  if (typeof input.ownVideoShare === "number" && input.ownVideoShare >= 0.4) return "Instagram Reels";
  return "Instagram and Facebook";
}

/**
 * A persona label ("The 5 PM Transitioner") names a segment for a strategy
 * deck; "Promote it to the 5 PM Transitioner" tells a media buyer nothing.
 * When the description carries a label, keep the description.
 */
const LABEL_WHO = /^(?:[Tt]he\s+)?(?:[A-Z0-9][\w'-]*\s+){0,4}[A-Z][\w'-]*,\s+who\s+(.+)$/;
const LABEL_COLON = /^(?:[Tt]he\s+)?(?:[A-Z0-9][\w'-]*\s+){0,4}[A-Z][\w'-]*:\s+(.{12,})$/;

/** A label with nothing after it: "The 5 PM Transitioner", "Weekend Warriors". */
const BARE_LABEL = /^(?:[Tt]he\s+)?(?:[A-Z0-9][\w'-]*\s*){1,5}$/;

function describe(raw: string): string | null {
  const text = raw.trim();
  if (!text || BARE_LABEL.test(text)) return null;
  const labelWho = LABEL_WHO.exec(text);
  if (labelWho) return `someone who ${labelWho[1]}`;
  const labelColon = LABEL_COLON.exec(text);
  return labelColon ? labelColon[1] : text;
}

/** The first clause of the target customer's description. A bare persona
 * label falls back to the brief's target customer, and to nobody at all
 * rather than to a name a media buyer can't target. */
function whoFor(input: AdCallInput): string | null {
  const raw = describe(input.campaign?.audience.who ?? "") ?? describe(input.targetCustomer?.who ?? "") ?? "";
  // Cut at the first clause that describes their situation rather than who
  // they are: ", and…", ", because…", ", comparing you against…".
  // ", and…", ", because…", " but is exhausted by…": the situation, not the person.
  const first = raw
    .split(/(?<=[.;])\s|,\s(?:who|and|because|triggered|[a-z]+ing)\b|\s(?:but|and)\s(?:is|are|who|was|were)\b/)[0]
    .trim()
    .replace(/[.;,]+$/, "");
  if (!first) return null;
  const short = (first.length > 90 ? first.slice(0, first.lastIndexOf(" ", 90)) : first)
    .trim()
    // Never end on a word that needs the next one: "exhausted by", "looking for".
    .replace(/\s+(?:by|to|with|for|and|but|or|of|in|on|at|from|who|that|which|is|are|the|a|an)$/i, "");
  return short.charAt(0).toLowerCase() + short.slice(1);
}

/** "up 40%"; a delta at the 100 clamp is "doubled or more", never "up 100%". */
function move(n: number): string {
  if (n >= 100) return "doubled or more";
  return `${n >= 0 ? "up" : "down"} ${Math.abs(Math.round(n))}%`;
}

function where(geoLabel: string): string {
  if (!geoLabel) return "";
  return geoLabel === "United States" ? " across the US" : ` in ${geoLabel}`;
}

export function buildAdCall(input: AdCallInput): AdCall {
  const verdict: AdVerdict = input.score >= RUN_AT ? "run" : input.score >= SMALL_AT ? "small" : "skip";
  const headline =
    verdict === "run" ? "Run this ad." : verdict === "small" ? "Run this ad, small." : "Hold this one this week.";

  const price = money(input.service?.price_cents ?? null);
  // The campaign writer may lead with a truer menu item than the scorer's
  // match (a "coffee shop open late" search is sold as the evening's $15
  // Sprotini, not a $3.50 drip). The call promotes what the ad actually sells.
  const serviceCore = input.service ? input.service.name.replace(/\([^)]*\)/g, " ").trim().toLowerCase() : "";
  const campaignText = input.campaign ? `${input.campaign.offer} ${input.campaign.hook}`.toLowerCase() : "";
  const leadsWithService = !input.campaign || !input.service || campaignText.includes(serviceCore);
  const offer = input.campaign?.offer.trim().replace(/[.]+$/, "") ?? "";
  const thing =
    !leadsWithService && offer
      ? `${/^[$\d]/.test(offer) ? "the " : ""}${offer}`
      : input.service
        ? `your ${withoutArticle(input.service.name)}${price ? ` (${price})` : ""}`
        : offer
          ? `${/^[$\d]/.test(offer) ? "the " : ""}${offer}`
          : `"${input.term}"`;
  const who = whoFor(input);
  const ageRange = input.campaign?.audience.age_range?.trim() || "";
  // Sentence-final now that the platform comes first: no trailing comma.
  const ages = ageRange ? `, ${ageRange}` : "";
  const platform = platformFor(input);
  const audience = who ? ` to ${who}${ages}` : ageRange ? ` to people ${ageRange}` : "";
  // The platform before the audience: a long "who" clause used to strand
  // "on TikTok" at the end of a sentence about someone's exhaustion.
  const promote = `Promote ${thing} on ${platform}${audience}.`;

  const angleType = input.campaign?.audience.angle_type ?? "offer";
  const seconds =
    typeof input.medianDurationSec === "number"
      ? Math.min(45, Math.max(10, Math.round(input.medianDurationSec / 5) * 5))
      : 20;
  const format = `${seconds}-second vertical video: ${STRUCTURE[angleType] ?? STRUCTURE.offer}. Shot on a phone, in your own space.`;

  const why: string[] = [];
  // Customer: what they're searching, in their own words.
  if (typeof input.weekPct === "number" && Math.abs(input.weekPct) >= 5) {
    why.push(
      `Searches ${move(input.weekPct)} this week${where(input.geoLabel)}${
        input.audiencePhrase ? `, in your customer's own words ("${input.audiencePhrase}")` : ""
      }`,
    );
  } else if (typeof input.monthPct === "number" && Math.abs(input.monthPct) >= 10) {
    why.push(`Searches ${move(input.monthPct)} over 30 days${where(input.geoLabel)}`);
  } else if (input.audiencePhrase) {
    why.push(`Steady demand, in your customer's own words ("${input.audiencePhrase}")`);
  }
  // Competitive: the direct rivals, and the angle they are NOT using.
  if (input.rivals && input.rivals.watched >= 2) {
    why.push(
      input.rivals.onTerm === 0
        ? `None of your ${input.rivals.watched} direct rivals is on it`
        : `Only ${input.rivals.onTerm} of your ${input.rivals.watched} direct rivals ${input.rivals.onTerm === 1 ? "is" : "are"} on it`,
    );
  }
  const rivalLead = input.rivalThemes[0];
  if (rivalLead && rivalLead.theme !== angleType && THEME_WORDS[rivalLead.theme]) {
    why.push(`Their ads lean on ${THEME_WORDS[rivalLead.theme]}, so ${THEME_WORDS[angleType] ?? "this angle"} stands apart`);
  }
  // Brand: what has worked for this business.
  if (input.ownBestTheme && input.ownBestTheme.vsAccount >= 1.1 && THEME_WORDS[input.ownBestTheme.theme]) {
    const lift = Math.round((input.ownBestTheme.vsAccount - 1) * 100);
    why.push(
      `Your past ads built on ${THEME_WORDS[input.ownBestTheme.theme]} ran ${lift}% above your account average${
        input.ownBestTheme.theme === angleType ? ", and this is one" : ""
      }`,
    );
  } else if (input.service) {
    why.push(leadsWithService ? `You already sell it${price ? ` at ${price}` : ""}` : "It's already on your menu");
  }
  // Cultural: only when there is a read, and last, because it decides how
  // the ad looks more than whether to run it.
  if (input.signals?.cultural !== null && input.signals?.cultural !== undefined && input.signalReasons?.cultural) {
    why.push(input.signalReasons.cultural.charAt(0).toUpperCase() + input.signalReasons.cultural.slice(1));
  }

  return {
    verdict,
    headline,
    promote,
    angle: input.campaign?.hook ? input.campaign.hook : null,
    format,
    why: why.slice(0, 5),
    scripts: input.scripts.slice(0, 3),
  };
}
