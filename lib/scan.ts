import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findPage, pageLooksRight } from "@/lib/adlibrary/resolve";
import type { ScrapedAd } from "@/lib/adlibrary/parse";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { commentSentiment, tagAds, tagEmails, writeReport } from "@/lib/ai/analyze";
import { adminSupabase } from "@/lib/db/supabase";
import type { Ad, Brand, OwnAdResult, Rival, RivalEmail, SiteChange, SocialProfile } from "@/lib/db/types";
import { conversionScore, matchPost, versionsOf, type PostPool } from "@/lib/score";
import { crossedProven } from "@/lib/diff";
import { sendReportEmail } from "@/lib/email";
import { isModelConfigured } from "@/lib/env";
import { NO_PAGE_NOTE } from "@/lib/format";
import { recordHealth } from "@/lib/health";
import { subscribeOnce } from "@/lib/inbox/store";
import { checkSite } from "@/lib/sitewatch/watch";
import { followerGrowth, refreshSocial } from "@/lib/social/store";
import type { SocialLine } from "@/lib/ai/analyze";

/**
 * One scan of one brand: read every rival's active ads and the brand's own
 * (the is_self rival), compare them with what we saw last time, read
 * everyone's Instagram and TikTok, tag the new ads, and have the model write a
 * report when something changed. The first scan of a rival is its baseline:
 * everything it runs is "seen", not "launched".
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
    await recordHealth(sb, rival, "ads", { ok: true, count: 0, note: "No Facebook Page running ads found" });
    return { ...none, remapped };
  }

  const { ads: scraped, complete, via } = read;
  const baseline = !rival.last_scraped_at;

  const { data: existingRows, error } = await sb.from("ads").select("*").eq("rival_id", rival.id);
  if (error) throw new Error(error.message);
  const existing = new Map((existingRows as Ad[]).map((a) => [a.archive_id, a]));
  const seen = new Set(scraped.map((a) => a.archiveId));

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
  // (a page we could not fetch) absence proves nothing, so nothing stops.
  const stoppedIds = complete
    ? [...existing.values()].filter((a) => a.active && !seen.has(a.archive_id)).map((a) => a.id)
    : [];
  let stopped: Ad[] = [];
  if (stoppedIds.length) {
    const { data } = await sb.from("ads").update({ active: false, stopped_at: now }).in("id", stoppedIds).select("*");
    stopped = (data ?? []) as Ad[];
  }

  await sb.from("rivals").update({ last_scraped_at: now, last_error: null }).eq("id", rival.id);
  rival.last_error = null;
  await recordHealth(sb, rival, "ads", { ok: true, count: scraped.length, via, note: complete ? null : "Partial read: some ads couldn't be fetched, so none were marked stopped" });
  if (baseline) return { ...none, remapped };

  const launched = upserted.filter((a) => !existing.has(a.archive_id));
  const proven = crossedProven(upserted, rival.last_scraped_at, now.slice(0, 10));
  const changes: RivalChanges = { launched, stopped, proven };
  const rowsOf = (kind: "launched" | "stopped" | "proven") =>
    changes[kind].map((a) => ({ brand_id: brand.id, rival_id: rival.id, ad_id: a.id, kind, detected_at: now }));
  const changeRows = [...rowsOf("launched"), ...rowsOf("stopped"), ...rowsOf("proven")];
  if (changeRows.length) await sb.from("ad_changes").insert(changeRows);
  return changes;
}

/** Tag every active ad the model has not read yet. */
async function tagUntagged(sb: SupabaseClient, brandId: string) {
  const base = () => sb.from("ads").select("id, body, title, cta, format").eq("brand_id", brandId).eq("active", true);
  // Ads tagged before topics existed get a topic too; without the topic column, angle alone decides.
  const withTopic = await base().or("angle.is.null,topic.is.null").limit(300);
  const hasTopic = !withTopic.error;
  const data = hasTopic ? withTopic.data : (await base().is("angle", null).limit(300)).data;
  const ads = (data ?? []) as Pick<Ad, "id" | "body" | "title" | "cta" | "format">[];
  for (let i = 0; i < ads.length; i += 60) {
    const tags = await tagAds(ads.slice(i, i + 60));
    await Promise.all(
      tags.map((t) => sb.from("ads").update({ angle: t.angle, hook: t.hook, offer: t.offer, ...(hasTopic ? { topic: t.topic } : {}) }).eq("id", t.id).eq("brand_id", brandId)),
    );
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

/**
 * Why a company's ads weren't read on this scan, or null when they were. A
 * failed read or a Page we couldn't find is unknown, not "runs no ads".
 */
function unreadReason(rival: Rival): string | null {
  if (!rival.page_id) return "we couldn't find its Facebook Page";
  if (rival.last_error) return `the read failed: ${rival.last_error}`;
  return null;
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

/** `forceReport`: write a report even when nothing changed (a manual scan, after the owner edited their context). */
export async function scanBrand(brandId: string, opts: { forceReport?: boolean } = {}): Promise<{ changes: number; report: boolean }> {
  const sb = adminSupabase();
  const { data: brand } = await sb.from("brands").select("*").eq("id", brandId).single<Brand>();
  if (!brand) throw new Error(`brand ${brandId} not found`);
  await sb.from("brands").update({ scan_status: "running", scan_error: null, scan_started_at: new Date().toISOString() }).eq("id", brandId);

  try {
    const { data: rivalRows } = await sb.from("rivals").select("*").eq("brand_id", brandId).order("created_at");
    const all = (rivalRows ?? []) as Rival[];
    // Brands created before self-tracking get their own row on the next scan.
    if (!all.some((r) => r.is_self)) {
      const { data: self } = await sb
        .from("rivals")
        .insert({ brand_id: brandId, name: brand.name, website: brand.url.replace(/^https?:\/\//, ""), is_self: true, source: "owner", reason: "Your brand" })
        .select("*")
        .single();
      if (self) all.push(self as Rival);
    }
    const rivals = all.filter((r) => !r.is_self);
    const self = all.find((r) => r.is_self) ?? null;

    const socialRun = refreshSocial(sb, brandId, all).catch((err) => {
      console.warn("[scan] social:", (err as Error).message);
      return [];
    });
    // Websites and inboxes, beside the ads. Either failing never fails the scan.
    const sideRun = pool(rivals, 3, async (rival) => {
      await Promise.all([
        checkSite(sb, brandId, rival).catch((err) => console.warn(`[scan] ${rival.name} site:`, (err as Error).message)),
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
        rival.last_error = message;
        await recordHealth(sb, rival, "ads", { ok: false, note: message });
        return { launched: [], stopped: [], proven: [] } satisfies RivalChanges;
      }
    });
    const changes: RivalChanges = {
      launched: results.flatMap((r) => r.launched),
      stopped: results.flatMap((r) => r.stopped),
      proven: results.flatMap((r) => r.proven),
    };
    const adChanges = changes.launched.length + changes.stopped.length + changes.proven.length;
    const remapped = results.some((r) => r.remapped);
    await sideRun;

    if (!isModelConfigured) {
      await sb.from("brands").update({ scan_status: "error", scan_error: "OPENAI_API_KEY is not set: ads were read but not analyzed.", last_scan_at: new Date().toISOString() }).eq("id", brandId);
      return { changes: adChanges, report: false };
    }

    const nameOf = new Map(all.map((r) => [r.id, r.is_self ? `${brand.name} (you)` : r.name]));
    await tagUntagged(sb, brandId);
    await tagUntaggedEmails(sb, brandId, nameOf).catch((err) => console.warn("[scan] email tags:", (err as Error).message));
    const profiles = await socialRun;
    await scoreAds(sb, brandId, profiles).catch((err) => console.warn("[scan] score:", (err as Error).message));
    const growth = await followerGrowth(sb, profiles.map((p) => p.id));
    const social: SocialLine[] = profiles
      .filter((p) => !p.error && p.followers !== null)
      .map((p) => ({ name: nameOf.get(p.rival_id) ?? "?", profile: p, growth: growth.get(p.id) ?? null }));

    const { data: lastReport } = await sb.from("reports").select("created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ created_at: string }>();
    const isBaseline = !lastReport;
    const since = lastReport?.created_at ?? "1970-01-01";
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    // The other two streams; reads fail quietly on a database without 0103 yet.
    const { data: siteRows } = await sb.from("site_changes").select("*").eq("brand_id", brandId).gte("detected_at", monthAgo).order("detected_at", { ascending: false }).limit(60);
    const { data: emailRows } = await sb
      .from("emails")
      .select("id, rival_id, subject, preview, received_at, kind, offer, theme, is_repeat")
      .eq("brand_id", brandId)
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
    let reported = false;
    if (isBaseline || changeCount > 0 || remapped || opts.forceReport) {
      const { data: adRows } = await sb.from("ads").select("*").eq("brand_id", brandId).eq("active", true);
      const ads = (adRows ?? []) as Ad[];
      // Re-read the changed ads so the report sees their fresh tags.
      const byId = new Map(ads.map((a) => [a.id, a]));
      const fresh = (list: Ad[]) => list.map((a) => byId.get(a.id) ?? a);
      if (ads.length || site.length || emails.length) {
        const body = await writeReport({
          brand,
          own: self ? ads.filter((a) => a.rival_id === self.id) : [],
          ownUnread: self ? unreadReason(self) : null,
          results: ((await sb.from("own_ad_results").select("*").eq("brand_id", brandId)).data ?? []) as OwnAdResult[],
          rivals: rivals.map((r) => ({ name: r.name, ads: ads.filter((a) => a.rival_id === r.id), unread: unreadReason(r) })),
          social,
          site,
          emails,
          changes: isBaseline ? null : { launched: fresh(changes.launched), stopped: changes.stopped, proven: fresh(changes.proven) },
          today: today(),
        });
        body.changes = {
          launched: changes.launched.length,
          stopped: changes.stopped.length,
          proven: changes.proven.length,
          site: site.filter((c) => c.fresh).length,
          emails: emails.filter((e) => e.fresh).length,
        };
        await sb.from("reports").insert({ brand_id: brandId, kind: isBaseline ? "baseline" : "update", body });
        reported = true;
        if (!isBaseline) await sendReportEmail(sb, brand, body).catch((err) => console.warn("[scan] email failed:", (err as Error).message));
      }
    }

    await sb.from("brands").update({ scan_status: "idle", last_scan_at: new Date().toISOString() }).eq("id", brandId);
    return { changes: changeCount, report: reported };
  } catch (err) {
    await sb.from("brands").update({ scan_status: "error", scan_error: (err as Error).message.slice(0, 300) }).eq("id", brandId);
    throw err;
  }
}
