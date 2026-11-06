import type { CardData } from "@/lib/creator/card";
import { tierOf } from "@/lib/creator/stats";

/** An invented creator for the /creators landing card. Not a real account. */
const POSTS: [string, number][] = [
  ["The 4-ingredient pasta I make when I can't think", 3.8],
  ["Grocery haul for the week", 0.6],
  ["Sunday reset in my kitchen", 0.4],
  ["I stopped buying pre-cut onions. Here's the math", 2.6],
  ["Dinner ideas part 6", 0.9],
  ["My knife skills a year ago vs now", 2.1],
  ["What I cooked this week", 0.5],
  ["Lunch prep with me", 1.1],
  ["Rice I made wrong for 10 years", 4.4],
  ["Easy dinner", 0.8],
  ["Kitchen tour", 1.0],
  ["Q&A", 0.3],
];
const MEDIAN = 1260;

export const SAMPLE_CREATOR: CardData = {
  handle: "noor.cooks",
  platform: "tiktok",
  followers: 31400,
  medianInteractions: MEDIAN,
  posts: POSTS.map(([caption, multiple]) => ({
    url: null,
    caption,
    posted_at: null,
    kind: "video",
    interactions: Math.round(MEDIAN * multiple),
    views: null,
    multiple,
    tier: tierOf(multiple),
  })),
  breakouts: POSTS.filter(([, m]) => m >= 2).length,
  bestMultiple: Math.max(...POSTS.map(([, m]) => m)),
  verdict: "Every breakout opens with a number or a mistake. Every stall opens with a label.",
};
