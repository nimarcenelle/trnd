import { targetCustomerOf } from "@/lib/ai/brief";
import { bestTheme, historyOnTerm } from "@/lib/ads/history-read";
import type { Repo } from "@/lib/db/repo";
import type {
  AdHistory,
  Business,
  BusinessBrief,
  Competitor,
  CompetitorRead,
  Signal,
  SocialPost,
  TargetCustomer,
} from "@/lib/db/types";
import {
  culturalFromSignal,
  isCulturalSource,
  type BrandProof,
  type CulturalRead,
  type FourSignalExtras,
  type RivalTermRead,
} from "@/lib/scoring";
import { engagementOf, postsOnTerm, readAccount, rivalMoves } from "@/lib/social/read";

/**
 * Everything the four signals need about one business, loaded once per
 * ranking and then read per term. The scorer stays pure; this is the only
 * place that knows where each signal's evidence lives.
 *
 * - customer: the brief's named target customer (their words, their triggers)
 * - competitive: the DIRECT rivals' ads and posts, not every place nearby
 * - cultural: short-form reads on the same term already in the signal pool
 * - brand: the owner's own past ads and their own posts
 */

/** Below this a rival is a neighbour, not a competitor for the same customer. */
export const DIRECT_MIN = 0.5;
/** With nobody over the bar, the closest rivals at least this near are
 * watched anyway: a Competitive read on the nearest brands beats none. */
export const NEAR_MIN = 0.3;
const NEAR_COUNT = 3;

/**
 * The rivals the Competitive signal watches: everyone over the bar, and an
 * unscored rival until it is scored. When nobody clears the bar, the three
 * nearest that are at least near. A brand is never graded against an empty
 * field for want of a perfect rival.
 */
export function competitiveSet(competitors: Competitor[]): Competitor[] {
  const direct = competitors.filter((c) => c.directness === null || c.directness === undefined || c.directness >= DIRECT_MIN);
  if (direct.length > 0) return direct;
  return competitors
    .filter((c) => typeof c.directness === "number" && c.directness >= NEAR_MIN)
    .sort((a, b) => (b.directness ?? 0) - (a.directness ?? 0))
    .slice(0, NEAR_COUNT);
}
/** A rival ad this old is still running because it works. */
const PROVEN_DAYS = 21;
/** Fewer own posts than this and "your usual" is not a number. */
const OWN_POSTS_MIN = 5;
/** Rival reads older than this describe a different market. */
const RIVAL_WINDOW_DAYS = 45;

export interface SignalContext {
  audience: TargetCustomer | null;
  /** Rivals that compete for the same customer — directness unknown counts
   * until it has been scored, so an old workspace is not left with none. */
  direct: Competitor[];
  rivalPosts: SocialPost[];
  ownPosts: SocialPost[];
  /** The latest ad read per direct rival. */
  adReads: CompetitorRead[];
  history: AdHistory[];
  /** Short-form reads in the pool, for search-led picks' cultural signal. */
  shortform: Signal[];
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn("[four-signals] read failed (non-fatal):", (err as Error).message);
    return fallback;
  }
}

export async function loadSignalContext(
  repo: Repo,
  business: Business,
  brief: BusinessBrief | null,
  pool: Signal[],
): Promise<SignalContext> {
  const [competitors, posts, reads, history] = await Promise.all([
    safe(repo.listCompetitors(business.id), [] as Competitor[]),
    safe(repo.listSocialPosts(business.id, { sinceDays: RIVAL_WINDOW_DAYS }), [] as SocialPost[]),
    safe(repo.listCompetitorReads(business.id, { sinceDays: RIVAL_WINDOW_DAYS }), [] as CompetitorRead[]),
    safe(repo.listAdHistory(business.id), [] as AdHistory[]),
  ]);
  const direct = competitiveSet(competitors);
  const directIds = new Set(direct.map((c) => c.id));
  const latestAds = new Map<string, CompetitorRead>();
  for (const r of reads) {
    if (r.kind !== "ads" || !directIds.has(r.competitor_id)) continue;
    const prev = latestAds.get(r.competitor_id);
    if (!prev || r.captured_at > prev.captured_at) latestAds.set(r.competitor_id, r);
  }
  return {
    audience: targetCustomerOf(brief),
    direct,
    rivalPosts: posts.filter((p) => p.competitor_id !== null && directIds.has(p.competitor_id)),
    ownPosts: posts.filter((p) => p.competitor_id === null),
    adReads: [...latestAds.values()],
    history,
    shortform: pool.filter((s) => s.metric_type === "shortform_views"),
  };
}

interface StoredAd {
  advertiser?: string;
  snippet?: string;
  headline?: string | null;
  runningDays?: number | null;
}

function adsOf(read: CompetitorRead): StoredAd[] {
  const ads = (read.raw as { ads?: unknown } | null)?.ads;
  return Array.isArray(ads) ? (ads as StoredAd[]) : [];
}

/** What the direct rivals are doing on this term. Null when fewer than two
 * have been read at all — one rival is an anecdote, not a field. */
export function rivalTermRead(term: string, ctx: Pick<SignalContext, "direct" | "rivalPosts" | "adReads">): RivalTermRead | null {
  const postsBy = new Map<string, SocialPost[]>();
  for (const p of ctx.rivalPosts) {
    if (!p.competitor_id) continue;
    postsBy.set(p.competitor_id, [...(postsBy.get(p.competitor_id) ?? []), p]);
  }
  const adsBy = new Map(ctx.adReads.map((r) => [r.competitor_id, adsOf(r)]));
  const read = ctx.direct.filter((c) => postsBy.has(c.id) || adsBy.has(c.id));
  if (read.length < 2) return null;
  const names: string[] = [];
  let onTerm = 0;
  let proven = 0;
  for (const c of read) {
    const posts = postsOnTerm(postsBy.get(c.id) ?? [], term);
    const ads = postsOnTerm(
      (adsBy.get(c.id) ?? []).map((a) => ({ ...a, caption: [a.headline, a.snippet].filter(Boolean).join(" ") })),
      term,
    );
    if (posts.length > 0 || ads.length > 0) {
      onTerm += 1;
      names.push(c.name);
    }
    proven += ads.filter((a) => typeof a.runningDays === "number" && a.runningDays >= PROVEN_DAYS).length;
  }
  return { watched: read.length, onTerm, names, proven };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Their own posts on this term against their own usual. */
export function ownSocialOnTerm(term: string, ownPosts: SocialPost[]): BrandProof | null {
  if (ownPosts.length < OWN_POSTS_MIN) return null;
  const on = postsOnTerm(ownPosts, term);
  if (on.length === 0) return null;
  const usual = readAccount(ownPosts).engagementMedian || median(ownPosts.map(engagementOf));
  if (usual <= 0) return null;
  const ratio = median(on.map(engagementOf)) / usual;
  const lift = Math.min(1, Math.max(0, 0.5 + (ratio - 1) * 0.25));
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const reason =
    pct < 10
      ? `your ${on.length} post${on.length === 1 ? "" : "s"} on this did about as well as your usual`
      : `your ${on.length} post${on.length === 1 ? "" : "s"} on this got ${pct}% ${ratio >= 1 ? "more" : "less"} engagement than your usual`;
  return { lift: Math.round(lift * 1000) / 1000, count: on.length, reason };
}

export function historyForTerm(term: string, rows: AdHistory[]): BrandProof | null {
  if (rows.length === 0) return null;
  const h = historyOnTerm(rows, term);
  return h.ads > 0 ? { lift: h.lift, count: h.ads, reason: h.reason } : null;
}

/** A search-led pick borrows the short-form read on the same term. */
export function culturalForTerm(signal: Signal, shortform: Signal[]): CulturalRead | null {
  if (isCulturalSource(signal)) return null;
  const match = shortform.find(
    (s) => s.normalized_term === signal.normalized_term || s.normalized_term.startsWith(`${signal.normalized_term}_`),
  );
  return match ? culturalFromSignal(match) : null;
}

export function extrasFor(signal: Signal, ctx: SignalContext): FourSignalExtras {
  return {
    audience: ctx.audience,
    rivals: rivalTermRead(signal.term, ctx),
    cultural: culturalForTerm(signal, ctx.shortform) ?? undefined,
    history: historyForTerm(signal.term, ctx.history),
    ownSocial: ownSocialOnTerm(signal.term, ctx.ownPosts),
  };
}

/** What the direct rivals' Meta ads lean on, most common first. */
export function rivalThemes(ctx: Pick<SignalContext, "adReads">): { theme: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of ctx.adReads) {
    const themes = (r.raw as { themes?: { theme?: string; count?: number }[] } | null)?.themes;
    for (const t of Array.isArray(themes) ? themes : []) {
      if (typeof t.theme !== "string") continue;
      counts.set(t.theme, (counts.get(t.theme) ?? 0) + (Number(t.count) || 0));
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({ theme, count }));
}

/** One line per rival move that touches this term: their posts and their ads. */
export function rivalLinesOnTerm(
  term: string,
  ctx: Pick<SignalContext, "direct" | "rivalPosts" | "adReads">,
  max = 5,
): string[] {
  const names = new Map(ctx.direct.map((c) => [c.id, c.name]));
  const lines: string[] = [];
  for (const m of rivalMoves(postsOnTerm(ctx.rivalPosts, term), new Date(), { days: RIVAL_WINDOW_DAYS, max })) {
    const name = m.competitorId ? names.get(m.competitorId) : null;
    if (name) lines.push(`${name}: ${m.line}`);
  }
  for (const r of ctx.adReads) {
    const name = names.get(r.competitor_id);
    if (!name) continue;
    const ads = postsOnTerm(
      adsOf(r).map((a) => ({ ...a, caption: [a.headline, a.snippet].filter(Boolean).join(" ") })),
      term,
    );
    for (const a of ads.slice(0, 2)) {
      const weeks = typeof a.runningDays === "number" ? Math.floor(a.runningDays / 7) : 0;
      lines.push(`${name} ad: "${(a.headline || a.snippet || "").slice(0, 120)}"${weeks >= 3 ? ` (running ${weeks} weeks)` : ""}`);
    }
  }
  return lines.slice(0, max);
}

/** The owner's own best posts of the last six weeks, captions first. */
export function ownTopPosts(ownPosts: SocialPost[], max = 3): { caption: string; engagement: number }[] {
  return [...ownPosts]
    .filter((p) => p.caption.trim().length > 0)
    .sort((a, b) => engagementOf(b) - engagementOf(a))
    .slice(0, max)
    .map((p) => ({ caption: p.caption.slice(0, 160), engagement: engagementOf(p) }));
}

/** What the campaign writer is told about the four signals for one pick. */
export interface CampaignSignalBrief {
  targetCustomer: TargetCustomer | null;
  rivalLines: string[];
  rivalThemes: { theme: string; count: number }[];
  ownBestTheme: { theme: string; vsAccount: number; ads: number } | null;
  ownTopPosts: { caption: string; engagement: number }[];
  /** Median length of the winning short-form on this term, when read. */
  medianDurationSec: number | null;
}

export function campaignSignalBrief(signal: Signal, ctx: SignalContext): CampaignSignalBrief {
  const cultural = isCulturalSource(signal)
    ? signal
    : ctx.shortform.find(
        (s) => s.normalized_term === signal.normalized_term || s.normalized_term.startsWith(`${signal.normalized_term}_`),
      );
  const secs = (cultural?.raw as { medianDurationSec?: unknown } | null | undefined)?.medianDurationSec;
  return {
    targetCustomer: ctx.audience,
    rivalLines: rivalLinesOnTerm(signal.term, ctx),
    rivalThemes: rivalThemes(ctx),
    ownBestTheme: bestTheme(ctx.history),
    ownTopPosts: ownTopPosts(ctx.ownPosts),
    medianDurationSec: typeof secs === "number" && Number.isFinite(secs) ? secs : null,
  };
}
