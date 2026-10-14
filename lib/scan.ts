import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { pickRivalPage } from "@/lib/adlibrary/match";
import type { ScrapedAd } from "@/lib/adlibrary/parse";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { tagAds, writeReport } from "@/lib/ai/analyze";
import { adminSupabase } from "@/lib/db/supabase";
import type { Ad, Brand, OwnAdResult, Rival } from "@/lib/db/types";
import { crossedProven } from "@/lib/diff";
import { sendReportEmail } from "@/lib/email";
import { isModelConfigured } from "@/lib/env";
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
}

const today = () => new Date().toISOString().slice(0, 10);

/** Find the rival's Page by searching its name, the first time only. */
async function resolvePage(sb: SupabaseClient, rival: Rival): Promise<string | null> {
  if (rival.page_id) return rival.page_id;
  const { ads } = await scrapeAds({ query: rival.name }, 60);
  const match = pickRivalPage(rival, ads);
  if (!match) return null;
  await sb.from("rivals").update({ page_id: match.pageId, page_name: match.pageName }).eq("id", rival.id);
  rival.page_id = match.pageId;
  rival.page_name = match.pageName;
  return match.pageId;
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
  const pageId = await resolvePage(sb, rival);
  if (!pageId) {
    await sb
      .from("rivals")
      // Not marked scraped: the first read that finds the Page is still its baseline.
      .update({ last_error: `No Facebook Page running ads under "${rival.name}" was found. Check the name or website.` })
      .eq("id", rival.id);
    return none;
  }

  const { ads: scraped, complete } = await scrapeAds({ pageId });
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
  if (baseline) return none;

  const launched = upserted.filter((a) => !existing.has(a.archive_id));
  const proven = crossedProven(upserted, rival.last_scraped_at, now.slice(0, 10));
  const changes: RivalChanges = { launched, stopped, proven };
  const rowsOf = (kind: keyof RivalChanges) =>
    changes[kind].map((a) => ({ brand_id: brand.id, rival_id: rival.id, ad_id: a.id, kind, detected_at: now }));
  const changeRows = [...rowsOf("launched"), ...rowsOf("stopped"), ...rowsOf("proven")];
  if (changeRows.length) await sb.from("ad_changes").insert(changeRows);
  return changes;
}

/** Tag every active ad the model has not read yet. */
async function tagUntagged(sb: SupabaseClient, brandId: string) {
  const { data } = await sb.from("ads").select("id, body, title, cta, format").eq("brand_id", brandId).eq("active", true).is("angle", null).limit(300);
  const ads = (data ?? []) as Pick<Ad, "id" | "body" | "title" | "cta" | "format">[];
  for (let i = 0; i < ads.length; i += 60) {
    const tags = await tagAds(ads.slice(i, i + 60));
    await Promise.all(tags.map((t) => sb.from("ads").update({ angle: t.angle, hook: t.hook, offer: t.offer }).eq("id", t.id).eq("brand_id", brandId)));
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
    const changes: RivalChanges = {
      launched: results.flatMap((r) => r.launched),
      stopped: results.flatMap((r) => r.stopped),
      proven: results.flatMap((r) => r.proven),
    };
    const changeCount = changes.launched.length + changes.stopped.length + changes.proven.length;

    if (!isModelConfigured) {
      await sb.from("brands").update({ scan_status: "error", scan_error: "OPENAI_API_KEY is not set: ads were read but not analyzed.", last_scan_at: new Date().toISOString() }).eq("id", brandId);
      return { changes: changeCount, report: false };
    }

    await tagUntagged(sb, brandId);
    const profiles = await socialRun;
    const growth = await followerGrowth(sb, profiles.map((p) => p.id));
    const nameOf = new Map(all.map((r) => [r.id, r.is_self ? `${brand.name} (you)` : r.name]));
    const social: SocialLine[] = profiles
      .filter((p) => !p.error && p.followers !== null)
      .map((p) => ({ name: nameOf.get(p.rival_id) ?? "?", profile: p, growth: growth.get(p.id) ?? null }));

    const { count: reportCount } = await sb.from("reports").select("id", { count: "exact", head: true }).eq("brand_id", brandId);
    const isBaseline = !reportCount;
    let reported = false;
    if (isBaseline || changeCount > 0 || opts.forceReport) {
      const { data: adRows } = await sb.from("ads").select("*").eq("brand_id", brandId).eq("active", true);
      const ads = (adRows ?? []) as Ad[];
      // Re-read the changed ads so the report sees their fresh tags.
      const byId = new Map(ads.map((a) => [a.id, a]));
      const fresh = (list: Ad[]) => list.map((a) => byId.get(a.id) ?? a);
      if (ads.length) {
        const body = await writeReport({
          brand,
          own: self ? ads.filter((a) => a.rival_id === self.id) : [],
          results: ((await sb.from("own_ad_results").select("*").eq("brand_id", brandId)).data ?? []) as OwnAdResult[],
          rivals: rivals.map((r) => ({ name: r.name, ads: ads.filter((a) => a.rival_id === r.id) })),
          social,
          changes: isBaseline ? null : { launched: fresh(changes.launched), stopped: changes.stopped, proven: fresh(changes.proven) },
          today: today(),
        });
        body.changes = { launched: changes.launched.length, stopped: changes.stopped.length, proven: changes.proven.length };
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
