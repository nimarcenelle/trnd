import type { Ad, SiteChange, SocialProfile } from "@/lib/db/types";
import { compact, daysRunningOf } from "@/lib/format";
import { interactions, topicsByScore } from "@/lib/score";

/**
 * The plain-language read behind the numbers: why an ad scores what it does,
 * where the brand's own ads stand against its competitors', and what a week
 * of competitor moves adds up to. Pure and deterministic, so every page says
 * the same thing about the same data, before and between reports.
 */

/** What an angle tag tells the reader, in one sentence. First match wins. */
const ANGLES: [RegExp, string][] = [
  [/social proof|review|testimonial|rating|trust/, "Leads with reviews, ratings or customer numbers, so buying feels safe."],
  [/ugc|creator|influencer/, "Looks made by a customer or creator, so it reads as a recommendation, not an ad."],
  [/problem|pain|solution/, "Names a problem the buyer has, then shows the product fixing it."],
  [/founder|origin|story|behind/, "Tells the story behind the brand to earn trust."],
  [/us vs|versus|comparison|\bvs\b|alternative/, "Puts the product beside the alternative and wins the comparison."],
  [/urgen|scarc|limited|last chance|deadline/, "Gives a reason to buy now: a deadline or limited stock."],
  [/price|discount|sale|deal|value|afford|offer|promo|bundle|free shipping/, "Leads with the price or a deal, to tip people who already want it."],
  [/educat|guide|how[- ]to|tips|explain|ingredient|checklist|planning/, "Teaches something useful first, so the product arrives as the answer."],
  [/personal|custom|monogram|made for/, "Shows the buyer it is made for them: their name, their choices, their fit."],
  [/gift/, "Sells it as a gift, aimed at the person buying rather than the one using it."],
  [/lifestyle|aspiration|style|inspir|envy|aesthetic|mood/, "Sells the look and the life around the product, not its features."],
  [/launch|new arrival|announce|drop|collab/, "Announces something new to win early attention."],
  [/feature|benefit|demo|showcase|product/, "Shows what the product does and why that beats what the buyer has now."],
  [/humor|meme|trend|pattern|attention/, "Stops the scroll with something unexpected, then lands the product."],
];

export function angleMeaning(angle: string | null | undefined): string | null {
  if (!angle) return null;
  const a = angle.toLowerCase();
  return ANGLES.find(([re]) => re.test(a))?.[1] ?? "How the ad tries to persuade: the reason it gives to care.";
}

/** The score in one word: what a reader should make of it. */
export function scoreVerdict(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null;
  if (score >= 80) return "Proven: they keep paying for it";
  if (score >= 60) return "Working";
  if (score >= 40) return "Unproven";
  return "Weak";
}

const share = (xs: number[], x: number) => (xs.length ? xs.filter((v) => v < x).length / xs.length : 0);

/**
 * Why an ad scores what it does, as sentences a marketer can repeat: how long
 * it has run against the market, how many versions, its reach on the Page,
 * and how its organic post did against the company's usual post.
 */
export function explainScore(ad: Ad, market: Ad[], versions = 1, now = Date.now()): string[] {
  const out: string[] = [];
  const days = daysRunningOf(ad, now);
  const liveDays = market.filter((a) => a.active).map((a) => daysRunningOf(a, now) ?? 0);
  if (days !== null) {
    const beat = Math.round(share(liveDays, days) * 100);
    out.push(
      `${ad.active ? "Live" : "Ran"} ${days} days${liveDays.length >= 10 && beat >= 50 ? `, longer than ${beat}% of the ${liveDays.length} live ads you watch` : ""}. Brands stop paying for ads that don't sell.`,
    );
  }
  const v = Math.max(versions, ad.variants);
  if (v > 1) out.push(`${v} versions running: they keep making more of it, which they do when it pays.`);
  if (ad.impression_rank !== null && ad.impression_rank !== undefined && ad.rank_total && ad.rank_total >= 3) {
    out.push(`#${ad.impression_rank + 1} of ${ad.rank_total} of their ads by impressions.`);
  }
  const e = ad.engagement;
  if (e) {
    const counts = [e.views ? `${compact(e.views)} views` : null, e.likes ? `${compact(e.likes)} likes` : null, e.comments ? `${compact(e.comments)} comments` : null]
      .filter(Boolean)
      .join(", ");
    const x = e.baseline ? interactions(e) / e.baseline : null;
    if (counts) out.push(`As an organic post: ${counts}${x && x >= 1.5 ? `, ${x >= 10 ? Math.round(x) : x.toFixed(1)}× their usual post` : ""}.`);
    if (e.sentiment !== null && e.sentiment >= 0.3) out.push("Commenters are mostly positive.");
    if (e.sentiment !== null && e.sentiment <= -0.2) out.push("Commenters skew negative: the reach may be costing them.");
  }
  if (ad.score_parts?.confidence === "low") out.push("Few signals to go on, so treat this score as a rough read.");
  return out;
}

export interface YouVsMarket {
  /** What the brand's own ads do well, with the number that shows it. */
  working: string[];
  /** What works for competitors that the brand doesn't run. */
  missing: string[];
  /** Where the brand runs the same thing and does it worse, and what to beat. */
  better: string[];
}

const key = (s: string) => s.toLowerCase().trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
const scoredLive = (a: Ad) => a.active && a.score !== null && a.score !== undefined;

/**
 * The brand's ads against its competitors', on the conversion score: what it
 * does well, what it is missing, and where it can get better. The baseline
 * every recommendation builds on, even before a report is written.
 */
export function youVsMarket(input: { you: Ad[]; them: Ad[]; nameOf: (rivalId: string) => string }): YouVsMarket {
  const you = input.you.filter(scoredLive);
  const them = input.them.filter(scoredLive);
  const out: YouVsMarket = { working: [], missing: [], better: [] };
  if (!them.length) return out;
  const theirScores = them.map((a) => a.score!);

  // Working: the brand's best ads that beat most of the market.
  const best = [...you].sort((a, b) => b.score! - a.score!);
  const seenHooks = new Set<string>();
  for (const a of best) {
    if (out.working.length >= 2) break;
    const beat = Math.round(share(theirScores, a.score!) * 100);
    if (beat < 60) break;
    const label = a.hook ?? a.title ?? a.topic;
    if (!label || seenHooks.has(key(label))) continue;
    seenHooks.add(key(label));
    const days = daysRunningOf(a);
    out.working.push(`“${label}” scores ${a.score}${days !== null ? ` after ${days} days` : ""}, ahead of ${beat}% of competitor ads.`);
  }

  const yourTopics = new Map<string, number[]>();
  for (const a of you) if (a.topic) yourTopics.set(key(a.topic), [...(yourTopics.get(key(a.topic)) ?? []), a.score!]);
  const theirTopics = topicsByScore(them, 12);

  for (const t of theirTopics) {
    const mine = yourTopics.get(key(t.topic));
    if (mine && avg(mine) >= t.avgScore + 5 && out.working.length < 3) {
      out.working.push(`On ${t.topic} your ads average ${avg(mine)}, against ${t.avgScore} for competitors.`);
    }
  }

  // Missing: what scores for them that the brand doesn't run at all.
  for (const t of theirTopics) {
    if (out.missing.length >= 3) break;
    if (yourTopics.has(key(t.topic)) || t.avgScore < 55) continue;
    const lead = them.filter((a) => a.topic && key(a.topic) === key(t.topic)).sort((a, b) => b.score! - a.score!)[0];
    const who = lead ? input.nameOf(lead.rival_id) : null;
    out.missing.push(`${cap(t.topic)}: ${t.ads} competitor ad${t.ads === 1 ? "" : "s"} averaging ${t.avgScore}${who ? `, led by ${who}` : ""}. You run none.`);
  }
  const yourAngles = new Set(you.filter((a) => a.angle).map((a) => key(a.angle!)));
  const topAngles = new Map<string, { label: string; n: number }>();
  for (const a of [...them].sort((x, y) => y.score! - x.score!).slice(0, Math.max(10, Math.ceil(them.length / 5)))) {
    if (!a.angle) continue;
    const k = key(a.angle);
    topAngles.set(k, { label: a.angle, n: (topAngles.get(k)?.n ?? 0) + 1 });
  }
  const angle = [...topAngles.entries()].filter(([k]) => !yourAngles.has(k)).sort((a, b) => b[1].n - a[1].n)[0];
  if (angle && angle[1].n >= 2 && out.missing.length < 4) {
    out.missing.push(`The ${angle[1].label} angle: ${angle[1].n} of the market's best ads use it. None of yours do.`);
  }

  // Better: same topic, weaker ads; then the ads dragging the brand down.
  for (const t of theirTopics) {
    if (out.better.length >= 2) break;
    const mine = yourTopics.get(key(t.topic));
    if (!mine || avg(mine) > t.avgScore - 8) continue;
    const lead = them.filter((a) => a.topic && key(a.topic) === key(t.topic)).sort((a, b) => b.score! - a.score!)[0];
    out.better.push(
      `${cap(t.topic)}: yours average ${avg(mine)}, theirs ${t.avgScore}.${lead?.hook ? ` The one to beat: ${input.nameOf(lead.rival_id)}'s “${lead.hook}” (${lead.score}).` : ""}`,
    );
  }
  const weak = you.filter((a) => a.score! < 40);
  if (you.length >= 4 && weak.length) {
    out.better.push(`${weak.length} of your ${you.length} scored live ads are under 40. Refresh them with what works above, or move their budget.`);
  }
  if (!you.length) out.better.push("We haven't scored any of your own ads yet. Once we read your Page, this compares them line by line.");
  return out;
}

/** A week of ad moves in one sentence: who pushed hardest and on what. */
export function adMovesTakeaway(changes: { kind: string; rival_id: string; ad: Ad | null }[], nameOf: (id: string) => string): string | null {
  const launched = changes.filter((c) => c.kind === "launched");
  const stopped = changes.filter((c) => c.kind === "stopped");
  if (!launched.length && !stopped.length) return null;
  const by = new Map<string, number>();
  for (const c of launched) by.set(c.rival_id, (by.get(c.rival_id) ?? 0) + 1);
  const [top, n] = [...by.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (top && n) {
    const topics = topicsByScore(
      launched.filter((c) => c.rival_id === top && c.ad).map((c) => ({ topic: c.ad!.topic ?? null, score: c.ad!.score ?? 50 })),
      1,
    );
    const share = launched.length > n ? ` of ${launched.length}` : "";
    return `${nameOf(top)} launched ${n}${share} new ads${topics[0] ? `, mostly ${topics[0].topic.toLowerCase()}` : ""}. A push that size is a bet they expect to pay off.`;
  }
  const s = new Map<string, number>();
  for (const c of stopped) s.set(c.rival_id, (s.get(c.rival_id) ?? 0) + 1);
  const [who, k] = [...s.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${nameOf(who)} stopped ${k} ad${k === 1 ? "" : "s"}: what they cut is what didn't pay.`;
}

const SITE_WEIGHT: Record<SiteChange["kind"], number> = {
  price_down: 5,
  sale_started: 5,
  promo_added: 4,
  new_product: 4,
  price_up: 3,
  message_changed: 3,
  dropped_product: 2,
  sale_ended: 1,
  promo_removed: 1,
};

/** The website change that matters most this week, in a sentence. */
export function siteTakeaway(changes: SiteChange[], nameOf: (id: string) => string): string | null {
  if (!changes.length) return null;
  const top = [...changes].sort((a, b) => SITE_WEIGHT[b.kind] - SITE_WEIGHT[a.kind] || b.detected_at.localeCompare(a.detected_at))[0];
  const more = changes.length - 1;
  return `${nameOf(top.rival_id)}: ${top.title}.${more ? ` Plus ${more} more change${more === 1 ? "" : "s"}.` : ""}`;
}

/**
 * Whether a social account did anything worth a marketer's attention, against
 * the other accounts on the same platform: unusual growth, engagement well
 * above or below the set, or a post far outside the account's usual.
 */
export function socialFlags(p: SocialProfile, growth: { from: number; to: number; days: number } | null | undefined, peers: SocialProfile[]): string[] {
  if (p.error || p.followers === null) return [];
  const out: string[] = [];
  if (growth && growth.from > 0 && growth.days >= 3) {
    const pct = ((growth.to - growth.from) / growth.from) * 100;
    if (pct >= 3) out.push(`Grew ${pct.toFixed(1)}% in ${growth.days} days: something is landing.`);
    if (pct <= -2) out.push(`Lost ${Math.abs(pct).toFixed(1)}% of followers in ${growth.days} days.`);
  }
  const rates = peers.filter((x) => x.platform === p.platform && !x.error && x.engagement_rate !== null && x.id !== p.id).map((x) => x.engagement_rate!);
  if (p.engagement_rate !== null && rates.length >= 2) {
    const mid = [...rates].sort((a, b) => a - b)[Math.floor(rates.length / 2)];
    if (mid > 0 && p.engagement_rate >= mid * 2) out.push(`Engagement ${(p.engagement_rate * 100).toFixed(2)}%, over twice the ${(mid * 100).toFixed(2)}% typical of the accounts you watch.`);
    if (mid > 0 && p.engagement_rate <= mid / 2) out.push(`Engagement ${(p.engagement_rate * 100).toFixed(2)}%, under half the ${(mid * 100).toFixed(2)}% typical of the accounts you watch.`);
  }
  const reach = p.recent.map((r) => r.views ?? r.likes ?? 0).filter((x) => x > 0);
  if (reach.length >= 4) {
    const sorted = [...reach].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    const hit = p.recent.find((r) => (r.views ?? r.likes ?? 0) >= mid * 5);
    if (hit && mid > 0) out.push(`One recent post did ${Math.round((hit.views ?? hit.likes ?? 0) / mid)}× their usual: “${(hit.caption ?? "").slice(0, 70)}${(hit.caption ?? "").length > 70 ? "…" : ""}”`);
  }
  return out;
}
