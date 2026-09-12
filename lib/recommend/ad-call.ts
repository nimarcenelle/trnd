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

/** The dashboard's worth-running bar (lib/campaigns/auto.ts). */
const SMALL_AT = 4.3;
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

function platformFor(input: Pick<AdCallInput, "culturalPlatform" | "ownVideoShare">): string {
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

/** The first clause of the target customer's description. */
function whoFor(input: AdCallInput): string | null {
  const raw = input.campaign?.audience.who || input.targetCustomer?.who || "";
  const first = raw.split(/(?<=[.;])\s|,\s(?:who|and|because|triggered)\b/)[0].trim().replace(/[.;,]+$/, "");
  if (!first) return null;
  const short = first.length > 90 ? `${first.slice(0, first.lastIndexOf(" ", 90)).trim()}` : first;
  return short.charAt(0).toLowerCase() + short.slice(1);
}

function pct(n: number): string {
  return `${Math.abs(Math.round(n))}%`;
}

export function buildAdCall(input: AdCallInput): AdCall {
  const verdict: AdVerdict = input.score >= RUN_AT ? "run" : input.score >= SMALL_AT ? "small" : "skip";
  const headline =
    verdict === "run" ? "Run this ad." : verdict === "small" ? "Run this ad, small." : "Hold this one this week.";

  const price = money(input.service?.price_cents ?? null);
  const thing = input.service ? `your ${input.service.name}${price ? ` (${price})` : ""}` : `"${input.term}"`;
  const who = whoFor(input);
  const ages = input.campaign?.audience.age_range ? `, ${input.campaign.audience.age_range},` : "";
  const platform = platformFor(input);
  const promote = `Promote ${thing}${who ? ` to ${who}${ages}` : ""} on ${platform}.`;

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
      `Searches ${input.weekPct >= 0 ? "up" : "down"} ${pct(input.weekPct)} this week${input.geoLabel ? ` in ${input.geoLabel}` : ""}${
        input.audiencePhrase ? `, in your customer's own words ("${input.audiencePhrase}")` : ""
      }`,
    );
  } else if (typeof input.monthPct === "number" && Math.abs(input.monthPct) >= 10) {
    why.push(`Searches ${input.monthPct >= 0 ? "up" : "down"} ${pct(input.monthPct)} over 30 days${input.geoLabel ? ` in ${input.geoLabel}` : ""}`);
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
    why.push(`You already sell it${price ? ` at ${price}` : ""}`);
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
