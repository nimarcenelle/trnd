/**
 * "How to run it well" — practical creative guidance for the week's
 * recommendation: what to shoot, how to write the caption, which tags to
 * ride. Deterministic and category-keyed; the campaign builder's generated
 * assets go deeper, this is the owner's 30-second orientation.
 */

export interface HowTo {
  contentAngle: string;
  captionDirection: string;
  hashtags: string[];
}

const CONTENT_ANGLE: Record<string, string> = {
  "Restaurants & cafés":
    "Shoot the item, not the room — one dish or drink, natural light, close enough to see texture. First frame should make someone hungry.",
  "Home services":
    "Show the finished job and the person who did it. Before/after of real work beats stock imagery every time in this category.",
  "Health & beauty":
    "Lead with the result, not the process — a clean, natural-light outcome shot outperforms treatment-room footage for terms like this.",
  "Fitness studios":
    "Film a real class moment — people mid-workout, imperfect and energetic. Polished promo footage reads as an ad and gets skipped.",
  "Retail & boutiques":
    "One product, styled your way, shot on your floor. Your point of view is the creative — catalog shots erase it.",
  "Auto services":
    "Show the work honestly — the bay, the lift, the fix. Straight-talking beats slick in a low-trust category.",
  "Dental & wellness":
    "Calm, bright, human — the practitioner talking or a genuine patient moment. Clinical stock imagery underperforms here.",
};

const CAPTION_DIRECTION: Record<string, string> = {
  "Restaurants & cafés":
    "Name the item and the price, then when to come get it. Specific beats clever — people share plans, not puns.",
  "Home services":
    "State the problem in the customer's words, then how fast you solve it. End with one clear way to book.",
  "Health & beauty":
    "Speak to the outcome your clients are searching for, then name your service directly so search and social both pick it up.",
  "Fitness studios":
    "Talk to the person starting over, not the regular. Name the intro offer and the exact first step.",
  "Retail & boutiques":
    "Tell the one-sentence story of the piece — where it's from, why you chose it — then say how many you have.",
  "Auto services":
    "Plain words, real price, real timeframe. The caption that sounds like your front desk wins the click.",
  "Dental & wellness":
    "Lower the barrier: what the first visit actually involves, how long it takes, and that booking is easy.",
};

const CATEGORY_TAGS: Record<string, string[]> = {
  "Restaurants & cafés": ["foodie", "eeeeeats", "supportlocal"],
  "Home services": ["homeimprovement", "beforeandafter", "supportlocal"],
  "Health & beauty": ["skincareroutine", "glowup", "selfcare"],
  "Fitness studios": ["fitnessjourney", "workoutmotivation", "gymlife"],
  "Retail & boutiques": ["shopsmall", "newarrivals", "supportlocal"],
  "Auto services": ["carcare", "automotive", "shoplocal"],
  "Dental & wellness": ["smile", "wellness", "selfcare"],
};

const tagify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildHowTo(opts: {
  term: string;
  category: string;
  city: string;
  /** Signal source — a "snapshot" pick is already business-specific, so the
   * broad category tags (#skincareroutine on a contrast-therapy studio)
   * would misfire; ride the term and the city instead. */
  source?: string;
  /** The matched menu item, tagged alongside the term when present. */
  serviceName?: string | null;
}): HowTo {
  const termTag = tagify(opts.term);
  const cityTag = tagify(opts.city);
  const serviceTag = opts.serviceName ? tagify(opts.serviceName) : "";
  const hashtags = [
    ...(termTag ? [termTag] : []),
    ...(serviceTag && serviceTag !== termTag ? [serviceTag] : []),
    ...(opts.source === "snapshot" ? ["supportlocal"] : (CATEGORY_TAGS[opts.category] ?? ["supportlocal"])),
    ...(cityTag ? [cityTag] : []),
  ].slice(0, 5);
  return {
    contentAngle:
      CONTENT_ANGLE[opts.category] ??
      "Shoot the real thing — your product, your space, your people. Authentic beats polished for local paid social.",
    captionDirection:
      CAPTION_DIRECTION[opts.category] ??
      "Say what it is, what it costs, and how to get it — in the voice you'd use across the counter.",
    hashtags,
  };
}

/** Live trend-surf links for a term — where to see what's working right now. */
export function trendLinks(term: string): { tiktok: string; instagram: string } {
  const tag = tagify(term);
  return {
    tiktok: `https://www.tiktok.com/tag/${tag}`,
    instagram: `https://www.instagram.com/explore/tags/${tag}/`,
  };
}

/**
 * TikTok signals display a humanized term ("hygiene routines") but the real
 * community tag lives in the raw payload ("hygienetok") — hashtags and trend
 * links should ride the actual tag.
 */
export function tiktokHashtag(signal: { source: string; raw: unknown }): string | null {
  if (signal.source !== "tiktok") return null;
  const name = (signal.raw as { hashtagName?: unknown } | null)?.hashtagName;
  return typeof name === "string" && name.length > 1 ? name : null;
}