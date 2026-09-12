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
}

function isDirect(c: Competitor): boolean {
  return c.directness === null || c.directness === undefined || c.directness >= DIRECT_MIN;
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
): Promise<SocialIngestSummary> {
  const summary: SocialIngestSummary = { ownPosts: 0, rivalPosts: 0, rivalReads: 0 };
  if (!isSocialReadAvailable()) return summary;
  const now = Date.now();

  for (const platform of PLATFORMS) {
    const handle = business.social_handles?.[platform];
    if (!handle) continue;
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
export async function ingestRivalAds(repo: Repo, business: Business, competitors: Competitor[]): Promise<number> {
  let written = 0;
  for (const c of competitors.filter(isDirect)) {
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
  return written;
}
