import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findPage, pageLooksRight } from "@/lib/adlibrary/resolve";
import type { ScrapedAd } from "@/lib/adlibrary/parse";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { commentSentiment, tagAds, tagEmails, writeReport } from "@/lib/ai/analyze";
import { adminSupabase } from "@/lib/db/supabase";
import type { Ad, Brand, OwnAdResult, ReportBody, Rival, RivalEmail, SiteChange, SocialProfile } from "@/lib/db/types";
import { conversionScore, matchPost, versionsOf, type PostPool } from "@/lib/score";
import { backfillEvents, backfillStopped, crossedProven, groupAdVersions, isLaunch, readLooksPartial, unseenStopped } from "@/lib/diff";
import { sendReportEmail } from "@/lib/email";
import { env, isModelConfigured } from "@/lib/env";
import { NO_PAGE_NOTE } from "@/lib/format";
import { subscribeOnce } from "@/lib/inbox/store";
import { planSwaps } from "@/lib/rivals";
import { checkSite } from "@/lib/sitewatch/watch";
import { followerGrowth, refreshSocial } from "@/lib/social/store";
import type { SocialLine } from "@/lib/ai/analyze";

/**
 * One scan of one brand: read every rival's active ads and the brand's own
 * (the is_self rival), compare them with what we saw last time, read
 * everyone's Instagram and TikTok, tag the new ads, and have the model write a
 * report when something changed. The first scan of a rival is its baseline:
 * everything it runs is "seen", not "launched".
 *
 * A scan is three stages (ads, tag, report), and a serverless function gets
 * 300 seconds. Jolie's first scan took 267 of them: the ads were read in 48,
 * the model work took the rest, and a brand with slower rivals would have
 * been killed mid-run with the dashboard stuck on "Scanning". So each stage
 * checks the clock, and when the budget is spent the scan writes where it is
 * (brands.scan_state) and asks /api/cron/scan to run the next stage in a
 * fresh invocation. Every stage reads its input from the database, never
 * from the memory of the stage before it.
 */

export interface RivalChanges {
  launched: Ad[];
  stopped: Ad[];
  proven: Ad[];
  /** The Page we held was not theirs and was replaced, so the last report is wrong. */
  remapped?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Find the rival's Page (site link, Ad Library search, then the model), the first time only. */
async function resolvePage(sb: SupabaseClient, brand: Brand, rival: Rival, exclude: string[] = []): Promise<{ pageId: string | null; tried: string[] }> {
  if (rival.page_id) return { pageId: rival.page_id, tried: [] };
  const found = await findPage({ name: rival.name, website: rival.website, category: brand.category }, { exclude });
  if (!found.page) return { pageId: null, tried: found.tried };
  await sb.from("rivals").update({ page_id: found.page.pageId, page_name: found.page.pageName }).eq("id", rival.id);
  rival.page_id = found.page.pageId;
  rival.page_name = found.page.pageName;
  // Found by the site's own link, an ad linking to the rival's site, or the model's look at the ads: confirmed.
  await markPage(sb, rival, "checked");
  return { pageId: found.page.pageId, tried: [] };
}

/**
 * Record how the Page was settled. A separate write, and a failed one is
 * ignored, so scans keep working on a database without the column yet.
 */
async function markPage(sb: SupabaseClient, rival: Rival, source: "checked" | "owner" | null) {
  rival.page_source = source;
  const { error } = await sb.from("rivals").update({ page_source: source }).eq("id", rival.id);
  if (error) console.warn("[scan] page_source not saved (run supabase/migrations/0102_page_source.sql):", error.message);
}

/** Forget a Page that turned out not to be the rival's, with every ad read from it. */
async function dropPage(sb: SupabaseClient, rival: Rival) {
  await sb.from("ads").delete().eq("rival_id", rival.id);
  await sb.from("rivals").update({ page_id: null, page_name: null, last_scraped_at: null }).eq("id", rival.id);
  rival.page_id = null;
  rival.page_name = null;
  rival.last_scraped_at = null;
  await markPage(sb, rival, null);
}

function row(brandId: string, rivalId: string, ad: ScrapedAd, now: string) {
  return {
    brand_id: brandId,
    rival_id: rivalId,
    archive_id: ad.archiveId,
    page_name: ad.pageName,
    body: ad.body,
    title: ad.title,
    cta: ad.cta,
    link_url: ad.linkUrl,
    format: ad.format,
    image_url: ad.imageUrl,
    video_url: ad.videoUrl,
    platforms: ad.platforms,
    variants: ad.variants,
    started_at: ad.startedAt,
    active: true,
    last_seen_at: now,
    stopped_at: null,
  };
}

export async function scanRival(sb: SupabaseClient, brand: Brand, rival: Rival): Promise<RivalChanges> {
  const none: RivalChanges = { launched: [], stopped: [], proven: [] };
  const now = new Date().toISOString();
  const company = { name: rival.name, website: rival.website, category: brand.category };
  let remapped = false;
  let { pageId, tried } = await resolvePage(sb, brand, rival);
  let read = pageId ? await scrapeAds({ pageId }) : null;

  // A Page matched before pages were confirmed may be someone else's (a Page
  // that only shares the name). Check it once against its ads and look again
  // if it is not theirs.
  if (pageId && read && !rival.page_source) {
    const wrong = pageId;
    if (await pageLooksRight(company, { pageId: wrong, pageName: rival.page_name ?? rival.name }, read.ads)) {
      await markPage(sb, rival, "checked");
    } else {
      console.warn(`[scan] ${rival.name}: Page ${rival.page_name} (${wrong}) is not theirs, looking again`);
      await dropPage(sb, rival);
      remapped = true;
      ({ pageId, tried } = await resolvePage(sb, brand, rival, [wrong]));
      read = pageId ? await scrapeAds({ pageId }) : null;
    }
  }

  if (!pageId || !read) {
    const searched = tried.length ? ` Searched: ${tried.map((t) => `"${t}"`).join(", ")}.` : "";
    await sb
      .from("rivals")
      // Not marked scraped: the first read that finds the Page is still its baseline.
      .update({ last_error: `${NO_PAGE_NOTE}.${searched}` })
      .eq("id", rival.id);
    return { ...none, remapped };
  }

  const { ads: scraped } = read;
  const baseline = !rival.last_scraped_at;

  const { data: existingRows, error } = await sb.from("ads").select("*").eq("rival_id", rival.id);
  if (error) throw new Error(error.message);
  const existing = new Map((existingRows as Ad[]).map((a) => [a.archive_id, a]));
  const seen = new Set(scraped.map((a) => a.archiveId));
  // A read that came back with under half of last time's ads is treated as
  // partial whatever it says: nothing stops on its word alone.
  const previouslyActive = [...existing.values()].filter((a) => a.active).length;
  let complete = read.complete;
  if (complete && readLooksPartial(previouslyActive, scraped.length)) {
    console.warn(`[scan] ${rival.name}: read ${scraped.length} of ${previouslyActive} active ads; treating the read as partial`);
    complete = false;
  }

  let upserted: Ad[] = [];
  if (scraped.length) {
    const { data, error: upsertError } = await sb
      .from("ads")
      .upsert(scraped.map((a) => row(brand.id, rival.id, a, now)), { onConflict: "rival_id,archive_id" })
      .select("*");
    if (upsertError) throw new Error(upsertError.message);
    upserted = data as Ad[];
    // The read comes back sorted by impressions: each ad's place in it is its reach rank.
    // A separate write, so a database without 0104 yet still scans.
    const { error: rankError } = await sb.from("ads").upsert(
      scraped.map((a, i) => ({ brand_id: brand.id, rival_id: rival.id, archive_id: a.archiveId, impression_rank: i, rank_total: scraped.length })),
      { onConflict: "rival_id,archive_id" },
    );
    if (rankError) console.warn("[scan] impression rank not saved (run supabase/migrations/0104_ad_scores.sql):", rankError.message);
  }

  // An ad missing from a complete read has stopped. From an incomplete read
  // absence proves little, so only an ad unseen for days of reads stops.
  const stoppedIds = complete
    ? [...existing.values()].filter((a) => a.active && !seen.has(a.archive_id)).map((a) => a.id)
    : unseenStopped([...existing.values()], seen, (a) => a.archive_id, now, rival.last_scraped_at).map((a) => a.id);
  let stopped: Ad[] = [];
  if (stoppedIds.length) {
    const { data } = await sb.from("ads").update({ active: false, stopped_at: now }).in("id", stoppedIds).select("*");
    stopped = (data ?? []) as Ad[];
  }

  await sb.from("rivals").update({ last_scraped_at: now, last_error: null }).eq("id", rival.id);
  if (baseline) {
    await backfillHistory(sb, brand, rival, pageId, upserted, now).catch((err) => console.warn(`[scan] ${rival.name} history:`, (err as Error).message));
    return { ...none, remapped };
  }

  const launched = upserted.filter((a) => !existing.has(a.archive_id) && isLaunch(a, rival.last_scraped_at, complete));
  const proven = crossedProven(upserted, rival.last_scraped_at, now.slice(0, 10));
  const changes: RivalChanges = { launched, stopped, proven };
  const rowsOf = (kind: "launched" | "stopped" | "proven") =>
    changes[kind].map((a) => ({ brand_id: brand.id, rival_id: rival.id, ad_id: a.id, kind, detected_at: now }));
  const changeRows = [...rowsOf("launched"), ...rowsOf("stopped"), ...rowsOf("proven")];
  if (changeRows.length) await sb.from("ad_changes").insert(changeRows);
  return changes;
}

/** Where a scan is. Persisted on the brand so the next invocation resumes it. */
export type ScanStage = "ads" | "tag" | "report";
export interface ScanState {
  stage: ScanStage;
  /** When this scan's ads stage began: the report stage reads ad_changes from here. */
  started: string;
  /** Write a report even when nothing changed (a manual scan, an edited profile). */
  force: boolean;
  /** A rival's Page was replaced during the ads stage, so the last report is wrong. */
  remapped: boolean;
}

/** Time one invocation spends before handing the rest of the scan to the next one. */
export const SCAN_BUDGET_MS = 170_000;
const TAG_BATCH = 60;
const TAG_CONCURRENCY = 3;

async function saveState(sb: SupabaseClient, brandId: string, state: ScanState | null) {
  const { error } = await sb.from("brands").update({ scan_state: state }).eq("id", brandId);
  if (error) console.warn("[scan] scan_state not saved (run supabase/migrations/0105_scan_state.sql):", error.message);
  return !error;
}

/** The origin the scan can call itself back on. */
function selfOrigin(): string | null {
  if (env.siteUrl && !/localhost|127\.0\.0\.1/.test(env.siteUrl)) return env.siteUrl.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return env.siteUrl || null;
}

/**
 * Ask a fresh invocation to run the next stage. The request is sent and not
 * waited for (waiting would hold this function open for the whole stage);
 * the route runs on after the client gives up. Needs the cron secret the
 * route checks; without one the caller keeps going inline.
 */
export function canHandOff(): boolean {
  return Boolean(env.cronSecret && selfOrigin());
}
function handOff(brandId: string, state: ScanState): void {
  const url = new URL("/api/cron/scan", selfOrigin()!);
  url.searchParams.set("brand", brandId);
  url.searchParams.set("stage", state.stage);
  if (state.force) url.searchParams.set("force", "1");
  fetch(url, { headers: { authorization: `Bearer ${env.cronSecret}` }, signal: AbortSignal.timeout(4_000), cache: "no-store" }).catch(() => {
    /* the route runs on regardless of whether this wait ends first */
  });
}

/** Stopped ads read on a Page's first scan: enough to cover a month of endings. */
const STOPPED_READ = 40;

/**
 * What a Page's first read can say about the last 30 days, so a fresh brand
 * does not start from a blank baseline: launches and proven ads from the
 * ads' own start dates, and stopped ads from a second read of the Page's
 * inactive ads with their end dates. None of these count as this scan's
 * changes (they are dated when they happened); they fill the timeline and
 * the week's numbers.
 */
async function backfillHistory(sb: SupabaseClient, brand: Brand, rival: Rival, pageId: string, active: Ad[], now: string): Promise<void> {
  const { launched, proven } = backfillEvents(active, now);
  const rows = [
    ...launched.map(({ ad, at }) => ({ brand_id: brand.id, rival_id: rival.id, ad_id: ad.id, kind: "launched", detected_at: at })),
    ...proven.map(({ ad, at }) => ({ brand_id: brand.id, rival_id: rival.id, ad_id: ad.id, kind: "proven", detected_at: at })),
  ];

  const ended = await scrapeAds({ pageId, status: "inactive" }, STOPPED_READ).catch((err) => {
    console.warn(`[scan] ${rival.name} stopped ads:`, (err as Error).message);
    return null;
  });
  let stoppedCount = 0;
  if (ended?.ads.length) {
    const stopped = backfillStopped(ended.ads, now);
    if (stopped.length) {
      const { data } = await sb
        .from("ads")
        .upsert(
          stopped.map(({ ad, at }) => ({ ...row(brand.id, rival.id, ad, now), active: false, stopped_at: at, last_seen_at: at })),
          { onConflict: "rival_id,archive_id", ignoreDuplicates: true },
        )
        .select("id, archive_id");
      const byArchive = new Map(((data ?? []) as Pick<Ad, "id" | "archive_id">[]).map((a) => [a.archive_id, a.id]));
      for (const { ad, at } of stopped) {
        const id = byArchive.get(ad.archiveId);
        if (id) {
          rows.push({ brand_id: brand.id, rival_id: rival.id, ad_id: id, kind: "stopped", detected_at: at });
          stoppedCount += 1;
        }
      }
    }
  }
  if (rows.length) await sb.from("ad_changes").insert(rows);
  console.log(`[scan] ${rival.name}: history ${launched.length} launched, ${proven.length} proven, ${stoppedCount} stopped`);
}

/**
 * Tag every active ad the model has not read yet, a few batches at a time,
 * until none are left or the clock runs out. Resumable: a second call picks
 * up the ads the first did not reach. (A cap of 300 ads per scan once left
 * 54 of Jolie's 354 untagged and invisible to the report.)
 */
async function tagUntagged(sb: SupabaseClient, brandId: string, deadline: number): Promise<{ done: boolean }> {
  const base = () => sb.from("ads").select("id, body, title, cta, format").eq("brand_id", brandId).eq("active", true);
  let hasTopic = true;
  for (;;) {
    // Ads tagged before topics existed get a topic too; without the topic column, angle alone decides.
    const withTopic = hasTopic ? await base().or("angle.is.null,topic.is.null").limit(TAG_BATCH * TAG_CONCURRENCY) : null;
    if (withTopic?.error) hasTopic = false;
    const data = hasTopic ? withTopic!.data : (await base().is("angle", null).limit(TAG_BATCH * TAG_CONCURRENCY)).data;
    const ads = (data ?? []) as Pick<Ad, "id" | "body" | "title" | "cta" | "format">[];
    if (!ads.length) return { done: true };
    if (Date.now() > deadline) return { done: false };
    const batches: (typeof ads)[] = [];
    for (let i = 0; i < ads.length; i += TAG_BATCH) batches.push(ads.slice(i, i + TAG_BATCH));
    const tagged = await Promise.all(batches.map((b) => tagAds(b)));
    const ids = new Set<string>();
    await Promise.all(
      tagged.flat().map((t) => {
        ids.add(t.id);
        return sb.from("ads").update({ angle: t.angle, hook: t.hook, offer: t.offer, ...(hasTopic ? { topic: t.topic } : {}) }).eq("id", t.id).eq("brand_id", brandId);
      }),
    );
    // An ad the model skipped would be asked for forever: mark it read with nothing.
    const skipped = ads.filter((a) => !ids.has(a.id));
    if (skipped.length) {
      await Promise.all(skipped.map((a) => sb.from("ads").update({ angle: "untagged", hook: null, offer: "none", ...(hasTopic ? { topic: null } : {}) }).eq("id", a.id)));
    }
  }
}

/**
 * Score every live ad (and those stopped in the last 30 days): match it to
 * the organic post it also runs as, read that post's comments for sentiment
 * once, and blend it all into the conversion score (lib/score.ts).
 */
async function scoreAds(sb: SupabaseClient, brandId: string, profiles: SocialProfile[]) {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await sb.from("ads").select("*").eq("brand_id", brandId).or(`active.eq.true,stopped_at.gte.${monthAgo}`).limit(2000);
  if (error || !data?.length) return;
  const ads = data as Ad[];
  if (!("score" in ads[0])) return; // 0104 not run yet
  const pools = new Map<string, PostPool[]>();
  for (const p of profiles) {
    if (p.error || !p.recent?.length) continue;
    pools.set(p.rival_id, [...(pools.get(p.rival_id) ?? []), { platform: p.platform, posts: p.recent }]);
  }

  // Engagement: a fresh match each scan (the numbers move), keeping the sentiment already read for the same post.
  const needSentiment: { id: string; comments: string[] }[] = [];
  for (const ad of ads) {
    const match = matchPost(ad, pools.get(ad.rival_id) ?? []);
    if (match && ad.engagement?.url === match.url) match.sentiment = ad.engagement.sentiment;
    ad.engagement = match;
    if (match && match.sentiment === null) {
      const post = pools.get(ad.rival_id)?.flatMap((p) => p.posts).find((p) => p.url === match.url);
      if (post?.top_comments?.length) needSentiment.push({ id: ad.id, comments: post.top_comments });
    }
  }
  if (needSentiment.length && isModelConfigured) {
    const read = await commentSentiment(needSentiment.slice(0, 60)).catch((e) => (console.warn("[scan] sentiment:", (e as Error).message), []));
    const byId = new Map(read.map((r) => [r.id, r.sentiment]));
    for (const ad of ads) if (ad.engagement && byId.has(ad.id)) ad.engagement.sentiment = byId.get(ad.id)!;
  }

  const t = today();
  const byRival = new Map<string, Ad[]>();
  for (const ad of ads) byRival.set(ad.rival_id, [...(byRival.get(ad.rival_id) ?? []), ad]);
  const rows = ads.map((ad) => {
    const { score, parts } = conversionScore({ ad, versions: versionsOf(ad, byRival.get(ad.rival_id) ?? []), today: t });
    return { brand_id: brandId, rival_id: ad.rival_id, archive_id: ad.archive_id, engagement: ad.engagement, score, score_parts: parts };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await sb.from("ads").upsert(rows.slice(i, i + 200), { onConflict: "rival_id,archive_id" });
    if (e) console.warn("[scan] scores not saved:", e.message);
  }
}

/** Kind, offer and theme for every email not yet read, judged against what that rival sent before. */
async function tagUntaggedEmails(sb: SupabaseClient, brandId: string, nameOf: Map<string, string>) {
  const { data, error } = await sb.from("emails").select("id, rival_id, subject, preview, received_at").eq("brand_id", brandId).is("kind", null).order("received_at").limit(120);
  if (error || !data?.length) return;
  const { data: earlierRows } = await sb.from("emails").select("rival_id, subject").eq("brand_id", brandId).not("kind", "is", null).order("received_at", { ascending: false }).limit(400);
  const earlier = (rivalId: string) => (earlierRows ?? []).filter((e) => e.rival_id === rivalId).map((e) => e.subject as string);
  const rows = data as Pick<RivalEmail, "id" | "rival_id" | "subject" | "preview" | "received_at">[];
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40);
    const tags = await tagEmails(batch.map((e) => ({ ...e, rival: nameOf.get(e.rival_id) ?? "?", earlier: earlier(e.rival_id) })));
    await Promise.all(tags.map((t) => sb.from("emails").update({ kind: t.kind, offer: t.offer, theme: t.theme, is_repeat: t.is_repeat }).eq("id", t.id).eq("brand_id", brandId)));
  }
}

/** Run `fn` over `items`, `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Every rival row of the brand, with the brand's own row added the first time. */
async function loadRivals(sb: SupabaseClient, brand: Brand): Promise<Rival[]> {
  const { data: rivalRows } = await sb.from("rivals").select("*").eq("brand_id", brand.id).order("created_at");
  const all = (rivalRows ?? []) as Rival[];
  // Brands created before self-tracking get their own row on the next scan.
  if (!all.some((r) => r.is_self)) {
    const { data: self } = await sb
      .from("rivals")
      .insert({ brand_id: brand.id, name: brand.name, website: brand.url.replace(/^https?:\/\//, ""), is_self: true, source: "owner", reason: "Your brand" })
      .select("*")
      .single();
    if (self) all.push(self as Rival);
  }
  return all;
}

/* --------------------------------- stages --------------------------------- */

/** Stage 1: every rival's ads, website and inbox, and everyone's social accounts. */
async function adsStage(sb: SupabaseClient, brand: Brand, state: ScanState): Promise<void> {
  const all = await loadRivals(sb, brand);
  const rivals = all.filter((r) => !r.is_self);
  const socialRun = refreshSocial(sb, brand.id, all).catch((err) => {
    console.warn("[scan] social:", (err as Error).message);
    return [];
  });
  // Websites and inboxes, beside the ads. Either failing never fails the scan.
  const sideRun = pool(rivals, 3, async (rival) => {
    await Promise.all([
      checkSite(sb, brand.id, rival).catch((err) => console.warn(`[scan] ${rival.name} site:`, (err as Error).message)),
      subscribeOnce(sb, rival).catch((err) => console.warn(`[scan] ${rival.name} signup:`, (err as Error).message)),
    ]);
  });
  const results = await pool(all, 3, async (rival) => {
    try {
      return await scanRival(sb, brand, rival);
    } catch (err) {
      const message = (err as Error).message.slice(0, 300);
      console.warn(`[scan] ${rival.name}:`, message);
      await sb.from("rivals").update({ last_error: message }).eq("id", rival.id);
      return { launched: [], stopped: [], proven: [] } satisfies RivalChanges;
    }
  });
  state.remapped = results.some((r) => Boolean(r.remapped));
  await Promise.all([sideRun, socialRun]);
  await swapIdleRivals(sb, brand, rivals).catch((err) => console.warn("[scan] swaps:", (err as Error).message));
}

/**
 * A seated rival the first read found running no Meta ads gives its seat to
 * the most direct spare the model named at setup, which is read now so the
 * report sees it. Once per seat; the owner's own additions are never swapped.
 */
async function swapIdleRivals(sb: SupabaseClient, brand: Brand, rivals: Rival[]): Promise<void> {
  const spares = brand.candidates?.spares ?? [];
  if (!spares.length) return;
  // Only rivals on their first read: a brand that advertised last month and paused is not idle.
  const fresh = rivals.filter((r) => !(brand.candidates?.swapped ?? []).some((s) => s.in === r.name));
  const { data: countRows } = await sb.from("ads").select("rival_id").eq("brand_id", brand.id).eq("active", true).in("rival_id", fresh.map((r) => r.id));
  const counts = new Map<string, number>();
  for (const row of countRows ?? []) counts.set(row.rival_id as string, (counts.get(row.rival_id as string) ?? 0) + 1);
  const { data: current } = await sb.from("rivals").select("id, name, source, page_id, last_scraped_at").in("id", fresh.map((r) => r.id));
  const firstRead = ((current ?? []) as Pick<Rival, "id" | "name" | "source" | "page_id" | "last_scraped_at">[]).filter((r) => !r.last_scraped_at || fresh.find((f) => f.id === r.id)?.last_scraped_at === null);
  const swaps = planSwaps(firstRead, (id) => counts.get(id) ?? 0, spares);
  if (!swaps.length) return;
  const used = new Set(swaps.map((s) => s.in.name));
  const swapped = [...(brand.candidates?.swapped ?? [])];
  for (const { out, in: spare } of swaps) {
    await sb.from("rivals").delete().eq("id", out.id);
    const { data: added } = await sb
      .from("rivals")
      .insert({ brand_id: brand.id, name: spare.name, website: spare.website || null, reason: spare.reason, source: "ai" })
      .select("*")
      .single<Rival>();
    swapped.push({ out: out.name, in: spare.name, at: new Date().toISOString() });
    console.log(`[scan] ${brand.name}: swapped ${out.name} (no Meta ads) for ${spare.name}`);
    if (added) {
      try {
        await scanRival(sb, brand, added);
        await Promise.all([
          checkSite(sb, brand.id, added).catch(() => undefined),
          subscribeOnce(sb, added).catch(() => undefined),
        ]);
      } catch (err) {
        await sb.from("rivals").update({ last_error: (err as Error).message.slice(0, 300) }).eq("id", added.id);
      }
    }
  }
  await sb.from("brands").update({ candidates: { spares: spares.filter((c) => !used.has(c.name)), swapped } }).eq("id", brand.id);
}

/** Stage 2: tag the ads and emails the model has not read, then score every ad. */
async function tagStage(sb: SupabaseClient, brand: Brand, deadline: number): Promise<{ done: boolean }> {
  const all = await loadRivals(sb, brand);
  const nameOf = new Map(all.map((r) => [r.id, r.is_self ? `${brand.name} (you)` : r.name]));
  const { done } = await tagUntagged(sb, brand.id, deadline);
  if (!done) return { done: false };
  await tagUntaggedEmails(sb, brand.id, nameOf).catch((err) => console.warn("[scan] email tags:", (err as Error).message));
  const { data } = await sb.from("social_profiles").select("*").eq("brand_id", brand.id);
  await scoreAds(sb, brand.id, (data ?? []) as SocialProfile[]).catch((err) => console.warn("[scan] score:", (err as Error).message));
  return { done: true };
}

/** This scan's ad changes, read back from the database with the ads they point at. */
async function changesSince(sb: SupabaseClient, brandId: string, since: string): Promise<{ launched: Ad[]; stopped: Ad[]; proven: Ad[] }> {
  const { data } = await sb.from("ad_changes").select("kind, ad_id").eq("brand_id", brandId).gte("detected_at", since);
  const rows = (data ?? []) as { kind: "launched" | "stopped" | "proven"; ad_id: string | null }[];
  const ids = [...new Set(rows.map((r) => r.ad_id).filter((id): id is string => Boolean(id)))];
  const ads = new Map<string, Ad>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: adRows } = await sb.from("ads").select("*").in("id", ids.slice(i, i + 200));
    for (const a of (adRows ?? []) as Ad[]) ads.set(a.id, a);
  }
  const of = (kind: "launched" | "stopped" | "proven") => rows.filter((r) => r.kind === kind && r.ad_id && ads.has(r.ad_id)).map((r) => ads.get(r.ad_id!)!);
  return { launched: of("launched"), stopped: of("stopped"), proven: of("proven") };
}

/** Stage 3: the report, when something changed or one was asked for. */
async function reportStage(sb: SupabaseClient, brand: Brand, state: ScanState): Promise<{ changes: number; report: boolean }> {
  const all = await loadRivals(sb, brand);
  const rivals = all.filter((r) => !r.is_self);
  const self = all.find((r) => r.is_self) ?? null;
  const nameOf = new Map(all.map((r) => [r.id, r.is_self ? `${brand.name} (you)` : r.name]));

  const { data: profileRows } = await sb.from("social_profiles").select("*").eq("brand_id", brand.id);
  const profiles = (profileRows ?? []) as SocialProfile[];
  const growth = await followerGrowth(sb, profiles.map((p) => p.id));
  const social: SocialLine[] = profiles
    .filter((p) => !p.error && p.followers !== null)
    .map((p) => ({ name: nameOf.get(p.rival_id) ?? "?", profile: p, growth: growth.get(p.id) ?? null }));

  const { data: lastReport } = await sb
    .from("reports")
    .select("created_at, body")
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string; body: ReportBody }>();
  const isBaseline = !lastReport;
  const since = lastReport?.created_at ?? "1970-01-01";
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const changes = await changesSince(sb, brand.id, state.started);
  const adChanges = changes.launched.length + changes.stopped.length + changes.proven.length;
  // The other two streams; reads fail quietly on a database without 0103 yet.
  const { data: siteRows } = await sb.from("site_changes").select("*").eq("brand_id", brand.id).gte("detected_at", monthAgo).order("detected_at", { ascending: false }).limit(60);
  const { data: emailRows } = await sb
    .from("emails")
    .select("id, rival_id, subject, preview, received_at, kind, offer, theme, is_repeat")
    .eq("brand_id", brand.id)
    .gte("received_at", monthAgo)
    // Keep untagged emails (kind null); `neq` alone would drop them.
    .or("kind.is.null,kind.neq.confirmation")
    .order("received_at", { ascending: false })
    .limit(60);
  const site = ((siteRows ?? []) as SiteChange[]).map((c) => ({ ...c, rival: nameOf.get(c.rival_id) ?? "?", fresh: c.detected_at > since }));
  const emails = ((emailRows ?? []) as (Pick<RivalEmail, "id" | "rival_id" | "subject" | "preview" | "received_at" | "kind" | "offer" | "theme" | "is_repeat">)[]).map((e) => ({
    ...e,
    rival: nameOf.get(e.rival_id) ?? "?",
    fresh: e.received_at > since,
  }));
  const changeCount = adChanges + site.filter((c) => c.fresh).length + emails.filter((e) => e.fresh).length;
  // Rivals whose ads could not be read this scan. With most of them unread
  // the standing report stays: a report written over missing data would say
  // the market went quiet when it was the read that failed.
  const unread = rivals.filter((r) => r.last_error && (!r.last_scraped_at || r.last_scraped_at < state.started));
  if (rivals.length && unread.length > rivals.length / 2) {
    const why = unread[0].last_error?.replace(/\.$/, "") ?? "unknown error";
    const note = `Ads could not be read for ${unread.length} of ${rivals.length} competitors (${why}). The report from the last full read stands.`;
    console.warn(`[scan] ${brand.name}: ${note}`);
    await sb.from("brands").update({ scan_error: note }).eq("id", brand.id);
    return { changes: changeCount, report: false };
  }
  if (!(isBaseline || changeCount > 0 || state.remapped || state.force)) return { changes: changeCount, report: false };

  const { data: adRows } = await sb.from("ads").select("*").eq("brand_id", brand.id).eq("active", true);
  const ads = (adRows ?? []) as Ad[];
  if (!ads.length && !site.length && !emails.length) return { changes: changeCount, report: false };
  const body = await writeReport({
    brand,
    own: self ? ads.filter((a) => a.rival_id === self.id) : [],
    results: ((await sb.from("own_ad_results").select("*").eq("brand_id", brand.id)).data ?? []) as OwnAdResult[],
    rivals: rivals.map((r) => ({ name: r.name, ads: ads.filter((a) => a.rival_id === r.id) })),
    social,
    site,
    emails,
    changes: isBaseline ? null : changes,
    // The standing report: an update amends it rather than starting over.
    previous: lastReport?.body ?? null,
    today: today(),
  });
  body.changes = {
    launched: changes.launched.length,
    stopped: changes.stopped.length,
    proven: changes.proven.length,
    site: site.filter((c) => c.fresh).length,
    emails: emails.filter((e) => e.fresh).length,
  };
  await sb.from("reports").insert({ brand_id: brand.id, kind: isBaseline ? "baseline" : "update", body });
  if (!isBaseline && changeCount > 0) {
    // The six competitor ads our score ranks highest ride along, creative and all.
    const topAds = groupAdVersions(ads.filter((a) => a.rival_id !== self?.id && a.score !== null && a.score !== undefined))
      .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0))
      .slice(0, 6)
      .map(({ lead, versions }) => ({ ad: lead, rival: nameOf.get(lead.rival_id) ?? lead.page_name ?? "", versions }));
    await sendReportEmail(sb, brand, body, topAds).catch((err) => console.warn("[scan] email failed:", (err as Error).message));
  }
  return { changes: changeCount, report: true };
}

const NEXT: Record<ScanStage, ScanStage | null> = { ads: "tag", tag: "report", report: null };

export interface ScanResult {
  changes: number;
  report: boolean;
  /** The stage handed to a fresh invocation, when this one ran out of time. */
  handedOff: ScanStage | null;
}

/**
 * Run a brand's scan from `opts.stage` (or where its saved state says it is,
 * or the start) until it is done or the time budget is spent. `forceReport`:
 * write a report even when nothing changed (a manual scan, after the owner
 * edited their context).
 */
export async function scanBrand(brandId: string, opts: { forceReport?: boolean; stage?: ScanStage; budgetMs?: number } = {}): Promise<ScanResult> {
  const sb = adminSupabase();
  const deadline = Date.now() + (opts.budgetMs ?? SCAN_BUDGET_MS);
  const { data: brand } = await sb.from("brands").select("*").eq("id", brandId).single<Brand & { scan_state?: ScanState | null }>();
  if (!brand) throw new Error(`brand ${brandId} not found`);

  // Resume a scan in progress; otherwise this is a new one.
  const saved = brand.scan_state && brand.scan_status === "running" ? brand.scan_state : null;
  const state: ScanState = saved
    ? { ...saved, stage: opts.stage ?? saved.stage, force: saved.force || Boolean(opts.forceReport) }
    : { stage: opts.stage ?? "ads", started: new Date().toISOString(), force: Boolean(opts.forceReport), remapped: false };
  if (!saved) {
    await sb.from("brands").update({ scan_status: "running", scan_error: null, scan_started_at: state.started }).eq("id", brandId);
  }
  await saveState(sb, brandId, state);

  try {
    let changes = 0;
    let report = false;
    for (;;) {
      if (state.stage === "ads") {
        await adsStage(sb, brand, state);
      } else if (state.stage === "tag") {
        if (!isModelConfigured) {
          await sb.from("brands").update({ scan_status: "error", scan_error: "OPENAI_API_KEY is not set: ads were read but not analyzed.", last_scan_at: new Date().toISOString(), scan_state: null }).eq("id", brandId);
          return { changes, report: false, handedOff: null };
        }
        const { done } = await tagStage(sb, brand, deadline);
        if (!done) {
          // Out of time with ads still untagged: the same stage, next invocation.
          if (canHandOff() && (await saveState(sb, brandId, state))) {
            handOff(brandId, state);
            return { changes, report, handedOff: state.stage };
          }
          continue;
        }
      } else {
        ({ changes, report } = await reportStage(sb, brand, state));
      }
      const next = NEXT[state.stage];
      if (!next) break;
      state.stage = next;
      await saveState(sb, brandId, state);
      if (Date.now() > deadline && canHandOff()) {
        handOff(brandId, state);
        return { changes, report, handedOff: next };
      }
    }
    await sb.from("brands").update({ scan_status: "idle", last_scan_at: new Date().toISOString(), scan_state: null }).eq("id", brandId);
    return { changes, report, handedOff: null };
  } catch (err) {
    await sb.from("brands").update({ scan_status: "error", scan_error: (err as Error).message.slice(0, 300), scan_state: null }).eq("id", brandId);
    throw err;
  }
}
