import type { IdeaSource } from "@/components/app/idea-card";
import type { Normal } from "@/lib/creators/stats";
import type { Idea, Video } from "@/lib/db/types";

/**
 * The landing page's example plan. Invented creators only (@marlow.studies,
 * @fenn.explains): never a real account's name on invented numbers.
 */

export const SAMPLE_HANDLE = "marlow.studies";

export const SAMPLE_NORMAL: Normal = { n: 30, views: 48000, low: 31000, high: 82000, savesPerK: 9, commentsPerK: 2.4 };

const video = (v: Partial<Video>): Video => ({
  id: "sample",
  creator_id: "sample",
  author: "fenn.explains",
  is_self: false,
  video_id: "sample",
  url: null,
  caption: null,
  hashtags: [],
  sound: null,
  sound_original: null,
  duration_s: null,
  cover_url: null,
  posted_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  format: null,
  hook: null,
  first_seen_at: "",
  last_read_at: "",
  ...v,
});

export const SAMPLE_IDEA: Idea = {
  type: "borrow",
  hook: '"I tested 7 AI study tools for a week. Only 2 are worth it."',
  so: "Ranked tool tests are the format beating their creators' usual views in your niche this month: @fenn.explains got 11× theirs. You already post single-tool videos; ranking several makes people stay to see the winner.",
  script: [
    { t: "0–2s", say: '"I tested 7 AI study tools for a week. Only 2 are worth it."', shot: "Seven paper app icons in a row. Five get flicked off the desk." },
    { t: "2–25s", say: "Tools 7 to 3, about four seconds each", shot: "One line per tool: what it claims, what it actually did. Keep it fast." },
    { t: "25–40s", say: "The top two, with a quick demo", shot: "Screen insert in a paper laptop frame. Show the result, not the menus." },
    { t: "40–45s", say: '"Which one did I miss? I\'ll test the top comment."', shot: "The question sets up your next video." },
  ],
  length: "42–45s",
  sound: "Your voiceover, quiet lo-fi underneath",
  post_time: "Saturday morning, when students plan their week",
  format: "Paper-cutout tier list, in your tabletop style",
  caption: "One week, 7 tools, real homework. Tell me what to test next.",
  hashtags: ["#studytok", "#aitools", "#studyhacks"],
  why: [
    "A ranking gives people a reason to watch to the end: they want the winner.",
    '"Which one did I miss?" pulls comments and hands you the next video.',
    "Your tool videos get 2.3× your usual saves. People keep them to use later.",
  ],
  make_it_yours: "Use your cutouts for the ranking board. That's what makes it yours, not a copy.",
  source_video: "sample",
  source_trend: "",
};

export const SAMPLE_SOURCE: IdeaSource = {
  video: video({ author: "fenn.explains", hook: "Ranking every AI note-taker", views: 2_400_000, saves: 61_000, hashtags: ["studytok", "aitools"] }),
  own: false,
  times: 11,
  borrow: { score: 91, parts: { beat: 1, fit: 1, fresh: 0.88, saved: 0.7 } },
  trend: null,
};
