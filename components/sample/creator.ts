import { creatorStats, type CreatorStats } from "@/lib/creator/stats";

/** Invented creators for the /creators landing cards. Not real accounts. */

interface SampleCreator {
  handle: string;
  platform: "tiktok" | "instagram";
  followers: number;
  stats: CreatorStats;
}

function sample(handle: string, platform: SampleCreator["platform"], followers: number, median: number, posts: [string, number][]): SampleCreator {
  const stats = creatorStats(
    posts.map(([caption, m], i) => ({
      url: null,
      caption,
      posted_at: new Date(Date.UTC(2026, 9, 30 - i * 2)).toISOString(),
      likes: Math.round(median * m),
      comments: 0,
      views: null,
      kind: "video",
    })),
  )!;
  return { handle, platform, followers, stats };
}

export const SAMPLE_CREATORS: SampleCreator[] = [
  sample("noor.cooks", "tiktok", 31400, 1260, [
    ["The 4-ingredient pasta I make when I can't think", 3.8],
    ["Grocery haul for the week", 0.4],
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
  ]),
  sample("jules.runs", "instagram", 8200, 410, [
    ["Morning run", 1.0],
    ["Shoe rotation", 0.9],
    ["I ran a 5K every day for a month. My knees, honestly", 6.2],
    ["Long run Sunday", 1.1],
    ["Race recap", 1.2],
    ["Stretch routine", 0.8],
    ["What I eat before a run", 1.0],
    ["Rest day", 0.9],
    ["Trail run", 1.1],
    ["New watch", 0.8],
    ["Interval day", 1.0],
    ["Run club", 1.2],
  ]),
  sample("tess.thrifts", "tiktok", 52800, 2900, [
    ["$12 at Goodwill vs $180 retail. Same coat", 2.9],
    ["Thrift with me", 1.0],
    ["The tag that tells you it's real wool", 3.4],
    ["Haul", 0.9],
    ["Styling one thrifted blazer 3 ways", 2.2],
    ["Try-on", 1.1],
    ["What sold this week", 0.8],
    ["Bins day", 1.0],
    ["Never buy these at a thrift store", 2.7],
    ["Outfit of the day", 0.9],
    ["Closet clean-out", 1.0],
    ["Shop update", 0.9],
  ]),
];
