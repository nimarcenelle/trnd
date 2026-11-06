import type { IdeaSource } from "@/components/app/idea-card";
import { gapOf } from "@/lib/creators/gap";
import type { Normal } from "@/lib/creators/stats";
import type { Idea, Video } from "@/lib/db/types";

/**
 * The landing page's examples: invented accounts with invented numbers, drawn
 * by the real components. A monetizing creator (around 40K followers, earning
 * from Creator Rewards) and a local business, never an account under 10K
 * (BRAND.md, Sample data). Not real people or shops.
 */

export const LENA = { handle: "lena.lifts", name: "Lena · home workouts", followers: 41_800, niche: ["homeworkout", "strengthtraining", "fitover30"] };

export const LENA_NORMAL: Normal = { n: 24, views: 78_000, low: 52_000, high: 121_000, savesPerK: 9.4, commentsPerK: 3.1 };

/** Her last 12 videos' views, oldest first, for the views strip. */
export const LENA_VIEWS = [61_000, 84_000, 72_000, 244_000, 55_000, 79_000, 91_000, 66_000, 70_000, 168_000, 75_000, 88_000];

export const LENA_AHEAD = [
  { handle: "coach.mari", followers: 96_000, typical: 288_000, best: "The 3 moves I'd keep if I could only train 10 minutes", bestViews: 1_400_000 },
  { handle: "liftwithdev", followers: 154_000, typical: 532_000, best: "Stop doing crunches for a stronger core. Do this.", bestViews: 2_100_000 },
  { handle: "strongat40", followers: 188_000, typical: 410_000, best: "What 30 days of daily push-ups did at 41", bestViews: 980_000 },
];

export const LENA_GAP = gapOf({ followers: LENA.followers, typical: LENA_NORMAL.views }, LENA_AHEAD, 12)!;

/** This week's three, by their hooks, for the mockup. */
export const LENA_WEEK = [
  { type: "borrow" as const, hook: "The 3 moves I'd keep if I could only train 10 minutes", time: "Tue 6:30 PM" },
  { type: "double_down" as const, hook: "Day 1 vs day 30 of the 10-minute routine you saved", time: "Thu 7:00 AM" },
  { type: "ride" as const, hook: "Rating gym advice from 2016, honestly", time: "Sat 10:00 AM" },
];

/** Last week's idea, checked 48 hours after posting. */
export const LENA_SCORECARD = { hook: "Why I stopped doing 100 squats a day", views: 164_000, times: 2.1 };

const SOURCE_VIDEO: Video = {
  id: "sample-src",
  creator_id: "",
  author: "coach.mari",
  is_self: false,
  video_id: "sample-src",
  url: null,
  caption: "The 3 moves I'd keep if I could only train 10 minutes #homeworkout #strengthtraining",
  hashtags: ["homeworkout", "strengthtraining"],
  sound: "original sound · coach.mari",
  sound_original: true,
  duration_s: 38,
  cover_url: null,
  posted_at: "2026-10-28T18:30:00Z",
  views: 1_400_000,
  likes: 121_000,
  comments: 2_300,
  shares: 9_800,
  saves: 41_000,
  format: "ranked list",
  hook: "three moves for a ten-minute workout",
  subtitle_url: null,
  spoken: null,
  first_seen_at: "2026-10-29T00:00:00Z",
  last_read_at: "2026-11-05T00:00:00Z",
};

export const LENA_IDEA: Idea = {
  type: "borrow",
  hook: "The 3 moves I'd keep if I could only train 10 minutes",
  so: "@coach.mari's ranked-list version got 4.9× her usual views last week. Your own short-routine videos already beat your usual, so this lands where your audience is.",
  script: [
    { t: "0-2s", say: "If I could only train ten minutes, I'd keep these three.", shot: "Straight to camera, mat already down, timer on screen.", point: "Promise a short list before anything else." },
    { t: "2-12s", say: "One: goblet squats. Legs, core and grip in one move.", shot: "One clean rep from the side, the move named on screen.", point: "Each move earns its place in one sentence." },
    { t: "12-24s", say: "Two: push-ups, slow on the way down. Three: a plank you actually hold.", shot: "Two quick demos, a 3-2-1 count overlay on the slow rep.", point: "Show the small detail that makes it work." },
    { t: "24-34s", say: "Three rounds, forty seconds each, twenty rest. That's it.", shot: "The routine as a simple card on screen.", point: "Give them the whole routine so they save it." },
    { t: "34-38s", say: "Which one would you drop?", shot: "Back to camera, eyebrow raised.", point: "One question that's easy to answer in a comment." },
  ],
  length: "35-40s",
  sound: "Original audio, your voice",
  post_time: "Tuesday 6:30 PM, when your saves peak",
  format: "Ranked list, three demos and a routine card",
  caption: "Save this for the days you have 10 minutes. Which one would you drop?",
  hashtags: ["#homeworkout", "#strengthtraining", "#fitover30", "#10minuteworkout"],
  why: [
    "It borrows the format that took @coach.mari to 1.4M views, a step ahead of you at 96K followers.",
    "Your two best videos this month were short routines (244K and 168K views), so your audience already wants this.",
    "A routine card at the end gives people a reason to save it, and saves are where you beat your usual.",
  ],
  make_it_yours: "Pick your own three moves and say why each one earned its place for you, not the ones she picked.",
  source_video: "sample-src",
  source_trend: "",
};

export const LENA_SOURCE: IdeaSource = { video: SOURCE_VIDEO, own: false, times: 4.9, borrow: null, trend: null };

/** The business example: a local shop, its products in the script, a local competitor's month. */
export const SHOP = {
  handle: "harborst.smoothies",
  name: "Harbor Street Smoothies",
  city: "Portland",
  followers: 12_400,
  typical: 6_800,
  product: "The Green Harbor, $9",
  offer: "Free protein boost before 10 AM",
  hook: "What $9 gets you at a smoothie shop that blends to order",
  beats: ["Hands on the counter: the five things that go in the Green Harbor.", "One blend, poured slow, the price on screen.", "The morning offer, and the street it's on."],
  competitor: { handle: "pdxjuicebar", topPost: "We tried every acai bowl in Portland so you don't have to", views: 64_000 },
};
