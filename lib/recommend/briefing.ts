import type { BusinessBrief, Service, Signal } from "@/lib/db/types";
import { AD_COUNT_LOCAL_MAX } from "@/lib/scoring";

/**
 * "Insights behind this pick" — the same seven questions, in the same order,
 * every week, for every pick.
 *
 * The old insight list answered whatever the data happened to support that
 * week (momentum / fit / gap / history), so no two picks read alike and an
 * owner could never build a habit of sweeping it. This is a briefing, not a
 * metrics dump: fixed slots an owner learns once and then reads in five
 * seconds, in the order they'd actually ask them.
 *
 * Two rules hold the whole thing up:
 *
 * 1. A slot with nothing real behind it is OMITTED, never filled with
 *    hedging. Six honest rows beat seven where one is "consider your
 *    audience". Every string here traces to the brief, the menu, the
 *    signal or the ad read.
 * 2. No scores, no component weights, no percentages of the model. This is
 *    the context that makes the grade legible without exposing how the
 *    grade is computed — the owner gets the why, not the formula.
 */

/** Fixed order. The owner learns it once. */
export const BRIEFING_SLOTS = [
  "WHO",
  "EDGE",
  "ANCHOR",
  "WHEN",
  "RIVALS",
  "NEVER",
  "WATCH-OUT",
] as const;

export type BriefingSlot = (typeof BRIEFING_SLOTS)[number];

export interface BriefingRow {
  slot: BriefingSlot;
  /** One sentence. Plain, specific, and about THIS business. */
  text: string;
}

export interface BriefingInput {
  brief: BusinessBrief | null;
  /** The service this pick matched, when the scorer found one. */
  matchedService: Service | null;
  signal: Signal | null;
  /** Relevant competing ads and the honest local count, from assessAdRead. */
  adCount: number | null;
  adAdvertisers: string[];
  /** A dated demand moment worth timing to, when one is near. */
  moment: { label: string; when: string } | null;
  city: string;
}

/**
 * Capitalise only a leading lowercase letter. `sentenceCase` walks to the
 * first letter anywhere in the string, which turns "5 competing ads" into
 * "5 Competing ads" — a capital mid-sentence that reads like a typo on a
 * row an owner sees every week.
 */
function leadCap(text: string): string {
  const first = text[0];
  return first && first >= "a" && first <= "z" ? first.toUpperCase() + text.slice(1) : text;
}

/** Cents → the way a price is written on an ad. Whole dollars stay whole:
 * "$45" is an offer, "$45.00" is an invoice. */
function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** The first sentence of a paragraph — briefs write prose, slots take one line. */
function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(.+?[.!?])(\s|$)/.exec(trimmed);
  const out = (match?.[1] ?? trimmed).trim();
  return out.length > 0 ? out : null;
}

/** Longest wins: briefs list advantages shortest-first surprisingly often,
 * and a two-word advantage ("good coffee") is not an edge worth leading on. */
function strongest(items: string[] | undefined): string | null {
  const usable = (items ?? []).map((s) => s.trim()).filter((s) => s.length > 8);
  if (usable.length === 0) return null;
  return usable.reduce((best, s) => (s.length > best.length ? s : best));
}

export function buildBriefing(input: BriefingInput): BriefingRow[] {
  const { brief, matchedService, adCount, adAdvertisers, moment, city } = input;
  const rows: BriefingRow[] = [];
  const push = (slot: BriefingSlot, text: string | null) => {
    if (text && text.trim().length > 0) rows.push({ slot, text: leadCap(text.trim()) });
  };

  // WHO — the customer segment this pick actually speaks to.
  push("WHO", brief?.customer_segments?.[0] ?? null);

  // EDGE — what this business has that rivals don't, to lead the ad with.
  push("EDGE", strongest(brief?.advantages) ?? firstSentence(brief?.moat));

  // ANCHOR — the real price to put on screen. A named service with a real
  // price beats any amount of positioning prose.
  push(
    "ANCHOR",
    matchedService && typeof matchedService.price_cents === "number"
      ? `Your ${matchedService.name} at ${money(matchedService.price_cents)} is the offer to put on screen.`
      : firstSentence(brief?.pricing_read),
  );

  // WHEN — a dated moment beats a season, and a season beats nothing.
  push(
    "WHEN",
    moment
      ? `${moment.label} — ${moment.when}.`
      : firstSentence(brief?.seasonality),
  );

  // RIVALS — the measured local field, never a guess. Above the local cap
  // the keyword read is national brand noise and cannot describe this town.
  if (typeof adCount === "number") {
    if (adCount >= AD_COUNT_LOCAL_MAX) {
      push("RIVALS", `Too many ads on this nationally to read your local field — treat the competition here as unknown.`);
    } else if (adCount === 0) {
      push("RIVALS", `Nobody in ${city} is running ads on this right now — the field is open.`);
    } else {
      const named = adAdvertisers.slice(0, 2).filter(Boolean);
      push(
        "RIVALS",
        `${adCount} competing ad${adCount === 1 ? "" : "s"} running near ${city}${named.length > 0 ? ` — ${named.join(", ")}` : ""}.`,
      );
    }
  }

  // NEVER — the trap. Briefs write watchouts as the thing to avoid.
  push("NEVER", strongest(brief?.watchouts));

  // WATCH-OUT — the second watchout, when the brief named more than one, so
  // the slot is a real second risk rather than a restatement of NEVER.
  const watchouts = (brief?.watchouts ?? []).map((s) => s.trim()).filter((s) => s.length > 8);
  const never = rows.find((r) => r.slot === "NEVER")?.text;
  const second = watchouts.find((w) => leadCap(w) !== never);
  push("WATCH-OUT", second ?? null);

  return rows;
}
