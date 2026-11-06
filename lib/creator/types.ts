import type { CreatorStats } from "./stats";

/**
 * A creator's type: the shape of their last posts, named so it is worth
 * sharing. Picked from the numbers alone, in a fixed order, so the same
 * posts always give the same type, and every line it says is one the
 * numbers show.
 */

export type CreatorTypeId = "hitmaker" | "wild_card" | "one_hit" | "climber" | "steady" | "quiet";

export interface CreatorType {
  id: CreatorTypeId;
  name: string;
  /** One line about them, true of their numbers. */
  line: string;
  /** What to do about it, in a sentence. */
  next: string;
}

const TYPES: Record<CreatorTypeId, Omit<CreatorType, "id" | "line">> = {
  hitmaker: { name: "The Hitmaker", next: "You've found something that travels. Keep the opening, change the topic." },
  wild_card: { name: "The Wild Card", next: "Your hits and misses are the same account, opened differently. Copy the openings that hit." },
  one_hit: { name: "The One-Hit Wonder", next: "One post did the heavy lifting. Work out why, and make it again on purpose." },
  climber: { name: "The Climber", next: "Breakouts are becoming a habit. Find what they share and do more of it." },
  steady: { name: "The Steady", next: "Your crowd shows up every time. The next step is a post that reaches past them." },
  quiet: { name: "The Quiet Patch", next: "Nothing is reaching past your regulars yet. Start with a sharper first line." },
};

export function creatorType(s: CreatorStats): CreatorType {
  const n = s.posts.length;
  const pick = (id: CreatorTypeId, line: string): CreatorType => ({ id, line, ...TYPES[id] });
  if (s.breakouts === 0) {
    return s.stalled <= 2
      ? pick("steady", `Every one of your last ${n} posts landed close to your usual. None broke out, almost none stalled.`)
      : pick("quiet", `None of your last ${n} posts broke out, and ${s.stalled} stalled at half your usual or less.`);
  }
  if (s.breakouts === 1 || (s.breakouts === 2 && s.topShare >= 0.5)) {
    return pick("one_hit", `Your best post got ${s.bestMultiple}× your usual. ${s.breakouts === 1 ? "Nothing else came close." : "One other came close."}`);
  }
  if (s.stalled >= 4) return pick("wild_card", `${s.breakouts} posts broke out and ${s.stalled} stalled. Big hits, big misses.`);
  if (s.breakoutRate >= 1 / 3) return pick("hitmaker", `${s.breakouts} of your last ${n} posts broke out. That's rare.`);
  return pick("climber", `${s.breakouts} of your last ${n} posts broke out, the best at ${s.bestMultiple}× your usual.`);
}

/** The same line for someone else reading it. */
export const theirLine = (line: string) => line.replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their").replace(/\byou\b/g, "they");

export const ALL_TYPES = Object.keys(TYPES) as CreatorTypeId[];
