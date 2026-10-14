import { findPage } from "@/lib/adlibrary/resolve";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { discoverRivals, tagAds, writeReport, type Discovery, type SocialLine } from "@/lib/ai/analyze";
import type { Ad } from "@/lib/db/types";
import { daysRunning } from "@/lib/diff";
import { env } from "@/lib/env";
import { pool } from "@/lib/pool";
import { engagementRate, postsPerWeek, readSocial } from "@/lib/social/read";
import { readSitePage } from "@/lib/site";

/**
 * One full TRND read of a business with no database: read the site, profile
 * the brand, name the rivals, pull the brand's and each rival's live Meta ads,
 * tag them and write the report. `pnpm run:once` and the free report on the
 * site both run this; the app's scan (lib/scan.ts) does the same with storage.
 */

export interface PipelineCompany {
  name: string;
  website: string;
  pageName: string | null;
  error: string | null;
  ads: Ad[];
  self?: boolean;
}

export interface PipelineResult {
  found: Discovery;
  companies: PipelineCompany[];
  report: Awaited<ReturnType<typeof writeReport>>;
  social: SocialLine[];
}

export interface PipelineOptions {
  /** Rivals read, most influential first (default: every one the model names). */
  rivals?: number;
  /** Ads tagged per company, longest-running first (default: all). The report reads the tagged ones. */
  tagPerCompany?: number;
  /** Read the brand's Instagram and TikTok (needs APIFY_TOKEN). */
  social?: boolean;
  /** Progress, in words a person can read. */
  onStage?: (stage: string) => void | Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

function toAd(a: Awaited<ReturnType<typeof scrapeAds>>["ads"][number], company: string): Ad {
  return {
    id: a.archiveId,
    brand_id: "",
    rival_id: company,
    archive_id: a.archiveId,
    page_name: a.pageName,
    body: a.body,
    title: a.title,
    cta: a.cta,
    link_url: a.linkUrl,
    format: a.format,
    image_url: a.imageUrl,
    video_url: a.videoUrl,
    platforms: a.platforms,
    variants: a.variants,
    started_at: a.startedAt,
    active: true,
    first_seen_at: "",
    last_seen_at: "",
    stopped_at: null,
    angle: null,
    hook: null,
    offer: null,
  };
}

export async function runPipeline(url: string, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const stage = async (s: string) => {
    await opts.onStage?.(s);
  };
  const host = new URL(url).hostname;

  await stage(`Reading ${host.replace(/^www\./, "")}`);
  const site = await readSitePage(url);
  const found = await discoverRivals(url, site.text);
  const rivals = found.rivals.slice(0, opts.rivals ?? found.rivals.length);

  await stage(`Finding ${rivals.length} competitors' live ads`);
  const list = [{ name: found.name, website: host, self: true }, ...rivals.map((r) => ({ name: r.name, website: r.website, self: false }))];
  const companies = await pool(list, 3, async (c): Promise<PipelineCompany> => {
    try {
      const hit = await findPage({ name: c.name, website: c.website, category: found.category });
      if (!hit.page) return { name: c.name, website: c.website, pageName: null, error: "no Page found", ads: [], self: c.self };
      const { ads } = await scrapeAds({ pageId: hit.page.pageId });
      return { name: c.name, website: c.website, pageName: hit.page.pageName, error: null, ads: ads.map((a) => toAd(a, c.name)), self: c.self };
    } catch (err) {
      return { name: c.name, website: c.website, pageName: null, error: (err as Error).message, ads: [], self: c.self };
    }
  });

  const day = today();
  const byAge = (ads: Ad[]) => [...ads].sort((a, b) => (daysRunning(b, day) ?? 0) - (daysRunning(a, day) ?? 0));
  for (const c of companies) c.ads = byAge(c.ads).slice(0, opts.tagPerCompany ?? c.ads.length);
  const all = companies.flatMap((c) => c.ads);
  if (!companies.some((c) => !c.self && c.ads.length)) throw new Error("None of these competitors is running Meta ads we could read right now.");

  await stage(`Reading ${all.length} ads`);
  const batches: Ad[][] = [];
  for (let i = 0; i < all.length; i += 60) batches.push(all.slice(i, i + 60));
  await pool(batches, 3, async (batch) => {
    for (const t of await tagAds(batch)) {
      const ad = batch.find((a) => a.id === t.id);
      if (ad) Object.assign(ad, { angle: t.angle, hook: t.hook, offer: t.offer });
    }
  });

  // Organic social, for the brand only.
  let social: SocialLine[] = [];
  if (opts.social && env.apifyToken && (site.socials.instagram || site.socials.tiktok)) {
    const reads = await readSocial({ instagram: site.socials.instagram ? [site.socials.instagram] : [], tiktok: site.socials.tiktok ? [site.socials.tiktok] : [] });
    social = reads.map((s) => ({
      name: `${found.name} (you)`,
      growth: null,
      profile: { platform: s.platform, handle: s.handle, followers: s.followers, posts_per_week: postsPerWeek(s.recent), engagement_rate: engagementRate(s.recent, s.followers), recent: s.recent },
    }));
  }

  await stage("Writing your report");
  const report = await writeReport({
    brand: { name: found.name, url, summary: found.summary, category: found.category, profile: found.profile },
    own: companies.find((c) => c.self)?.ads ?? [],
    rivals: companies.filter((c) => !c.self).map((c) => ({ name: c.name, ads: c.ads })),
    social,
    changes: null,
    today: day,
  });
  return { found, companies, report, social };
}
