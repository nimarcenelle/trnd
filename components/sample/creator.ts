import { benchmarkFrom, type Benchmark } from "@/lib/creator/benchmark";
import { creatorStats, type CreatorStats } from "@/lib/creator/stats";

/** Invented creators for the /creators landing cards. Not real accounts. */

interface SampleCreator {
  handle: string;
  platform: "tiktok" | "instagram";
  followers: number;
  stats: CreatorStats;
  /** What the written read would say is killing the posts, and the first fix. Invented, like the account. */
  killer: string;
  fix: string;
  /** Invented top posts in their niche, from invented accounts. */
  benchmark: Benchmark | null;
}

/** An invented niche: [handle, followers, caption, likes]. */
type Niche = [string, number, string, number][];

function sample(handle: string, platform: SampleCreator["platform"], followers: number, median: number, killer: string, fix: string, tag: string, niche: Niche, posts: [string, number][]): SampleCreator {
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
  const benchmark = benchmarkFrom(
    niche.map(([h, f, caption, likes]) => ({ handle: h, followers: platform === "tiktok" ? f : null, caption, likes, comments: Math.round(likes * 0.02), shares: null, views: null, url: null })),
    { handle, followers, stats, tag, platform },
  );
  return { handle, platform, followers, stats, killer, fix, benchmark };
}

export const SAMPLE_CREATORS: SampleCreator[] = [
  sample("noor.cooks", "tiktok", 31400, 1260, "Your flops are titled like a menu. Nobody stops for \"Easy dinner\".", "The pasta I make when I can't think, in 4 ingredients", "easyrecipes", [
    ["dinnerwithdre", 412000, "Stop salting your pasta water like this", 186000],
    ["thelazycook", 96000, "I made the viral feta pasta wrong on purpose", 74000],
    ["mira.eats", 38000, "The $3 dinner my grandma made every Friday", 41000],
    ["sam.preps", 154000, "5 dinners, 1 grocery bag, $40", 52000],
    ["bowlsbykai", 61000, "Why your rice is mushy (it's not the water)", 66000],
  ], [
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
    ["Easy weeknight rice", 0.3],
  ]),
  sample("jules.runs", "instagram", 8200, 410, "Every post but one is a diary entry. Your one hit was a dare.", "I ran 10K every Sunday for a month. My time, honestly", "runningmotivation", [
    ["paceandpatience", 0, "I ran a marathon with no training plan. Mistake.", 48000],
    ["mile.with.mo", 0, "What 100 days of running did to my resting heart rate", 31000],
    ["trailkat", 0, "The run that made me quit, and the one that brought me back", 22000],
    ["runbyrae", 0, "Couch to 5K, week 1 vs week 8", 19000],
  ], [
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
  sample("tess.thrifts", "tiktok", 52800, 2900, "\"Haul\" and \"Try-on\" tell a stranger nothing. Your hits all name a price or a secret.", "The $8 blazer label that means it's worth $200", "thrifting", [
    ["vintage.vera", 640000, "I found a $4,000 bag at Goodwill. Here's how I knew", 512000],
    ["binsboy", 210000, "Bins day: $1 a pound, 3 designer pieces", 160000],
    ["resell.rhi", 88000, "What I paid vs what it sold for", 96000],
    ["thriftwithtoni", 132000, "Never leave a thrift store without checking this", 140000],
  ], [
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
