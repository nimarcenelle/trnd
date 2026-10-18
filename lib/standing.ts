import type { Ad } from "@/lib/db/types";
import { topicsByScore, type TopicRow } from "@/lib/score";

/**
 * Where the brand stands on the conversion score: every company ranked by the
 * strength of its best ads, the brand's best ad ranked among every ad in the
 * market, and the topics that work for competitors that the brand isn't using.
 */

export interface BrandStanding {
  rivalId: string;
  name: string;
  you: boolean;
  /** Mean score of its top 5 live ads: how strong its best work is. Null with nothing scored. */
  strength: number | null;
  scoredAds: number;
  best: Ad | null;
  rank: number | null;
}

export interface Standing {
  brands: BrandStanding[];
  you: BrandStanding | null;
  /** The brand's best live ad's place among every scored live ad, and how many there are. */
  bestAdRank: number | null;
  totalAds: number;
  /** Topics that score for competitors, and whether the brand runs them. */
  topics: (TopicRow & { yours: boolean })[];
}

const TOP = 5;
const scored = (a: Ad) => a.active && a.score !== null && a.score !== undefined;

export function standing(input: { companies: { id: string; name: string; you: boolean }[]; ads: Ad[] }): Standing {
  const live = input.ads.filter(scored);
  const brands: BrandStanding[] = input.companies.map((c) => {
    const theirs = live.filter((a) => a.rival_id === c.id).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = theirs.slice(0, TOP);
    return {
      rivalId: c.id,
      name: c.name,
      you: c.you,
      strength: top.length ? Math.round(top.reduce((s, a) => s + (a.score ?? 0), 0) / top.length) : null,
      scoredAds: theirs.length,
      best: theirs[0] ?? null,
      rank: null,
    };
  });
  const ranked = brands.filter((b) => b.strength !== null).sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  ranked.forEach((b, i) => (b.rank = i + 1));
  const you = brands.find((b) => b.you) ?? null;

  const all = [...live].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const bestAdRank = you?.best ? all.findIndex((a) => a.id === you.best!.id) + 1 : null;

  const yourTopics = new Set(live.filter((a) => a.rival_id === you?.rivalId && a.topic).map((a) => a.topic!.toLowerCase().trim()));
  const theirAds = live.filter((a) => a.rival_id !== you?.rivalId);
  const topics = topicsByScore(theirAds, 6).map((t) => ({ ...t, yours: yourTopics.has(t.topic.toLowerCase().trim()) }));

  return { brands: [...ranked, ...brands.filter((b) => b.strength === null)], you, bestAdRank: bestAdRank || null, totalAds: all.length, topics };
}
