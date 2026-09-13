import type { Repo } from "@/lib/db/repo";
import type { Business, Competitor, SocialPlatform } from "@/lib/db/types";
import { DIRECT_MIN } from "@/lib/recommend/four-signals";
import { fetchAdvertiserAds, isAdLibraryApifyAvailable, readAdvertiser } from "@/lib/signals/adlibrary-apify";
import { fetchGoogleAds, readGoogleAds } from "@/lib/signals/google-ads-transparency";
import { fetchAccountPosts, isSocialReadAvailable } from "@/lib/social";
import { classifyPost, readAccount, rivalMoves } from "@/lib/social/read";

/**
 * The brand and competitive half of the daily intel run: the business's own
 * public accounts, its direct rivals' accounts, and what those rivals are
 * paying to show on Meta and Google.
 *
 * Every account read is a paid Apify run, so accounts are refreshed at most
 * every two days — engagement on a post settles within that, and a daily
 * re-read would pay twice for the same numbers. Only DIRECT rivals are read;
 * the diner down the street that also pours coffee is not worth a dollar a
 * week of scraping.
 */

const PLATFORMS: SocialPlatform[] = ["instagram", "tiktok", "facebook"];
const REFRESH_HOURS = 48;

export interface SocialIngestSummary {
  ownPosts: number;
  rivalPosts: number;
  rivalReads: number;
  /** True when the deadline passed with accounts still unread. */
  exhausted: boolean;
}

function isDirect(c: Competitor): boolean {
  return c.directness === null || c.directness === undefined || c.directness >= DIRECT_MIN;
}

/** A read of the same public account by another workspace inside this
 * window is this workspace's read too: the posts are the same posts. */
const REUSE_DAYS = 7;

/**
 * The same handle read recently under another business (a brand that signed
 * up twice, a rival two brands share) is copied rather than scraped again:
 * one paid read per account per week, and a fresh signup starts with the
 * posts on day one instead of an empty Brand column.
 */
async function reuseRecentRead(
  repo: Repo,
  business: Business,
  competitorId: string | null,
  platform: SocialPlatform,
  handle: string,
  now: number,
): Promise<number> {
  const want = handle.toLowerCase();
  const floor = now - REUSE_DAYS * 86_400_000;
  let others: Business[] = [];
  try {
    others = (await repo.listAllBusinesses()).filter((b) => b.id !== business.id);
  } catch {
    return 0;
  }
  for (const other of others) {
    const sources: { competitorId: string | null }[] = [];
    if (other.social_handles?.[platform]?.toLowerCase() === want) sources.push({ competitorId: null });
    const rivals = await repo.listCompetitors(other.id).catch(() => []);
    for (const c of rivals) if (c.social_handles?.[platform]?.toLowerCase() === want) sources.push({ competitorId: c.id });
    for (const source of sources) {
      const posts = (await repo.listSocialPosts(other.id, { competitorId: source.competitorId, platform, sinceDays: 120 })).filter(
        (p) => Date.parse(p.captured_at) >= floor,
      );
      if (posts.length === 0) continue;
      return repo.upsertSocialPosts(
        posts.map((p) => ({
          business_id: business.id,
          competitor_id: competitorId,
          platform: p.platform,
          external_id: p.external_id,
          url: p.url,
          caption: p.caption,
          media_type: p.media_type,
          posted_at: p.posted_at,
          likes: p.likes,
          comments: p.comments,
          shares: p.shares,
          views: p.views,
          is_ad: p.is_ad,
          kind: p.kind,
        })),
      );
    }
  }
  return 0;
}

async function readAccountInto(
  repo: Repo,
  business: Business,
  competitorId: string | null,
  platform: SocialPlatform,
  handle: string,
  now: number,
): Promise<number> {
  const existing = await repo.listSocialPosts(business.id, { competitorId, platform, sinceDays: 120 });
  if (existing.some((p) => now - Date.parse(p.captured_at) < REFRESH_HOURS * 3_600_000)) return 0;
  const reused = await reuseRecentRead(repo, business, competitorId, platform, handle, now);
  if (reused > 0) return reused;
  // Only the scrape itself needs the paid reader; a reuse never does.
  if (!isSocialReadAvailable()) return 0;
  const drafts = await fetchAccountPosts(platform, handle);
  if (drafts.length === 0) return 0;
  return repo.upsertSocialPosts(
    drafts.map((d) => ({
      ...d,
      business_id: business.id,
      competitor_id: competitorId,
      kind: d.kind ?? classifyPost(d.caption),
    })),
  );
}

/** Owner-facing cadence clause: "posts 4 times a week, up from 2". */
function cadence(perWeek: number, prev: number): string {
  const n = Math.round(perWeek * 10) / 10;
  const p = Math.round(prev * 10) / 10;
  const base = n === 0 ? "hasn't posted in four weeks" : `posts ${n} time${n === 1 ? "" : "s"} a week`;
  if (n === 0 || Math.abs(n - p) < 1) return base;
  return `${base}, ${n > p ? "up" : "down"} from ${p}`;
}

export async function ingestSocialAccounts(
  repo: Repo,
  business: Business,
  competitors: Competitor[],
  opts: { deadline?: number } = {},
): Promise<SocialIngestSummary> {
  const summary: SocialIngestSummary = { ownPosts: 0, rivalPosts: 0, rivalReads: 0, exhausted: false };
  const now = Date.now();
  const deadline = opts.deadline ?? Infinity;
  // Checked before each paid read, never mid-read.
  const outOfTime = () => Date.now() > deadline;

  for (const platform of PLATFORMS) {
    const handle = business.social_handles?.[platform];
    if (!handle) continue;
    if (outOfTime()) {
      summary.exhausted = true;
      return summary;
    }
    try {
      summary.ownPosts += await readAccountInto(repo, business, null, platform, handle, now);
    } catch (err) {
      console.warn(`[intel:social] own ${platform} read failed:`, (err as Error).message);
    }
  }

  for (const c of competitors.filter(isDirect)) {
    for (const platform of PLATFORMS) {
      const handle = c.social_handles?.[platform];
      if (!handle) continue;
      if (outOfTime()) {
        summary.exhausted = true;
        return summary;
      }
      try {
        summary.rivalPosts += await readAccountInto(repo, business, c.id, platform, handle, now);
      } catch (err) {
        console.warn(`[intel:social] ${c.name} ${platform} read failed:`, (err as Error).message);
      }
    }
    try {
      const posts = await repo.listSocialPosts(business.id, { competitorId: c.id, sinceDays: 56 });
      if (posts.length === 0) continue;
      const account = readAccount(posts);
      const moves = rivalMoves(posts, new Date(now), { days: 7, max: 3 });
      summary.rivalReads += await repo.upsertCompetitorReads([
        {
          competitor_id: c.id,
          business_id: business.id,
          kind: "social",
          value: Math.round(account.postsPerWeek * 10) / 10,
          rating: null,
          summary: `${cadence(account.postsPerWeek, account.prevPostsPerWeek)}${moves[0] ? `. ${moves[0].line}` : ""}`,
          raw: {
            moves,
            postsPerWeek: account.postsPerWeek,
            prevPostsPerWeek: account.prevPostsPerWeek,
            engagementMedian: account.engagementMedian,
            videoShare: account.videoShare,
            byKind: account.byKind,
          },
        },
      ]);
    } catch (err) {
      console.warn(`[intel:social] ${c.name} summary failed:`, (err as Error).message);
    }
  }
  return summary;
}

const sameAdvertiser = (rival: string, advertiser: string) => {
  const a = advertiser.toLowerCase().trim();
  const r = rival.toLowerCase().trim();
  return Boolean(a) && (a.includes(r) || r.includes(a));
};

const domainOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * What each direct rival is paying to show. Meta through the Ad Library
 * (Apify), Google through the Ads Transparency Center. Neither reports spend
 * for a US commercial advertiser, so "working" is read the only honest way
 * available: an ad still running after three weeks is one they kept paying for.
 */
export async function ingestRivalAds(
  repo: Repo,
  business: Business,
  competitors: Competitor[],
  opts: { deadline?: number } = {},
): Promise<{ written: number; exhausted: boolean }> {
  let written = 0;
  const deadline = opts.deadline ?? Infinity;
  for (const c of competitors.filter(isDirect)) {
    if (Date.now() > deadline) return { written, exhausted: true };
    if (isAdLibraryApifyAvailable()) {
      try {
        const ads = (await fetchAdvertiserAds(c.name)).filter((a) => sameAdvertiser(c.name, a.advertiser));
        const read = readAdvertiser(ads);
        const weeks = read.longestRunningDays !== null ? Math.floor(read.longestRunningDays / 7) : 0;
        written += await repo.upsertCompetitorReads([
          {
            competitor_id: c.id,
            business_id: business.id,
            kind: "ads",
            value: read.active,
            rating: null,
            summary:
              read.active === 0
                ? "no active Meta ads"
                : `${read.active} active Meta ad${read.active === 1 ? "" : "s"}${
                    weeks >= 3 ? `, one running ${weeks} weeks` : ""
                  }${read.newThisWeek > 0 ? `, ${read.newThisWeek} new this week` : ""}`,
            raw: {
              source: "apify",
              ads: read.sample.map((a) => ({
                advertiser: a.advertiser,
                snippet: a.snippet,
                headline: a.headline,
                cta: a.cta,
                runningDays: a.runningDays,
                startedOn: a.startedOn,
                url: a.url,
              })),
              themes: read.themes,
              proven: read.proven.length,
              newThisWeek: read.newThisWeek,
            },
          },
        ]);
      } catch (err) {
        console.warn(`[intel:ads] Meta read for ${c.name} failed:`, (err as Error).message);
      }
    }
    const domain = domainOf(c.website);
    if (!domain) continue;
    try {
      const google = await fetchGoogleAds(domain);
      if (google.length === 0) continue;
      const read = readGoogleAds(google);
      const formats = Object.entries(read.formats)
        .filter(([f, n]) => n > 0 && f !== "unknown")
        .map(([f, n]) => `${n} ${f}`)
        .join(", ");
      written += await repo.upsertCompetitorReads([
        {
          competitor_id: c.id,
          business_id: business.id,
          kind: "google_ads",
          value: read.active,
          rating: null,
          summary:
            read.active === 0
              ? "no Google ads shown in the last two weeks"
              : `${read.active} Google ad${read.active === 1 ? "" : "s"} live${formats ? ` (${formats})` : ""}`,
          raw: { sample: read.sample, formats: read.formats },
        },
      ]);
    } catch (err) {
      console.warn(`[intel:ads] Google read for ${c.name} failed:`, (err as Error).message);
    }
  }
  return { written, exhausted: false };
}
