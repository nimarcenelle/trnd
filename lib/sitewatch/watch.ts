import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Rival } from "@/lib/db/types";
import { get } from "@/lib/site";

import { recentProducts, diffSnapshots, shopifyProducts, snapshotFrom, type SiteDiff, type SiteSnapshot } from "./snapshot";

/**
 * Read a competitor's homepage and catalog, compare with the last snapshot,
 * and record what changed. The first read is the baseline: nothing changed.
 */

function baseUrl(website: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

export async function readSnapshot(website: string): Promise<{ url: string; snapshot: SiteSnapshot } | null> {
  const base = baseUrl(website);
  if (!base) return null;
  const [html, catalogRaw] = await Promise.all([get(base), get(`${base}/products.json?limit=250`, { accept: "application/json" })]);
  let catalog = null;
  if (catalogRaw) {
    try {
      catalog = shopifyProducts(JSON.parse(catalogRaw), base);
    } catch {
      // not a Shopify store
    }
  }
  // A JavaScript-rendered homepage comes back nearly empty; the reader renders it.
  const thin = !html || html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, "").trim().length < 400;
  const markdown = thin ? await get(`https://r.jina.ai/${base}`, { accept: "text/plain" }) : null;
  if (!html && !markdown && !catalog?.length) return null;
  return { url: base, snapshot: snapshotFrom({ html: thin ? null : html, markdown, base, catalog }) };
}

/** One rival's website check. Returns the changes it recorded. */
export async function checkSite(sb: SupabaseClient, brandId: string, rival: Rival): Promise<SiteDiff[]> {
  if (!rival.website) return [];
  const read = await readSnapshot(rival.website);
  const now = new Date().toISOString();
  if (!read) {
    await sb.from("rivals").update({ site_checked_at: now }).eq("id", rival.id);
    return [];
  }
  const { data: recentRows } = await sb.from("site_snapshots").select("id, data").eq("rival_id", rival.id).order("captured_at", { ascending: false }).limit(4);
  const recent = (recentRows ?? []) as { id: string; data: SiteSnapshot }[];
  const last = recent[0] ?? null;

  const diffs = last ? diffSnapshots(last.data, read.snapshot, recent.slice(1).map((r) => r.data)) : [];
  // The first read has nothing to diff against, but the catalog says what the store added lately.
  if (!last) {
    const recent = recentProducts(read.snapshot, now);
    if (recent.length) await sb.from("site_changes").insert(recent.map((d) => ({ ...d, url: d.url ?? read.url, brand_id: brandId, rival_id: rival.id })));
  }
  if (!last || last.data.text_hash !== read.snapshot.text_hash || diffs.length) {
    await sb.from("site_snapshots").insert({ brand_id: brandId, rival_id: rival.id, url: read.url, data: read.snapshot, captured_at: now });
    // Keep the latest few, not a year of homepages.
    const { data: old } = await sb.from("site_snapshots").select("id").eq("rival_id", rival.id).order("captured_at", { ascending: false }).range(5, 100);
    if (old?.length) await sb.from("site_snapshots").delete().in("id", old.map((o) => o.id));
  }
  if (diffs.length) {
    await sb.from("site_changes").insert(diffs.map((d) => ({ ...d, url: d.url ?? read.url, brand_id: brandId, rival_id: rival.id, detected_at: now })));
  }
  await sb.from("rivals").update({ site_checked_at: now }).eq("id", rival.id);
  return diffs;
}
