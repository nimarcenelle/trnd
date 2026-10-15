"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { pageFromInput } from "@/lib/adlibrary/resolve";
import { discoverRivals, ProfileSchema } from "@/lib/ai/analyze";
import { rankCandidates, toSpare } from "@/lib/rivals";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/data";
import { adminSupabase } from "@/lib/db/supabase";
import { MAX_RIVALS } from "@/lib/db/types";
import { isModelConfigured, isStripeConfigured } from "@/lib/env";
import { isScanning, SCAN_MIN_GAP_MS } from "@/lib/format";
import { scanBrand } from "@/lib/scan";
import { parseAdsExport } from "@/lib/results";
import { normHandle } from "@/lib/social/read";
import { normalizeUrl, readSitePage } from "@/lib/site";

export interface FormState {
  error?: string;
}

async function requireBrand() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  return { user, brand };
}

/** Step one: read the site, have the model name the brand and its rivals. */
export async function createBrandAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const url = normalizeUrl(String(formData.get("url") ?? ""));
  if (!url) return { error: "Enter your website, like yourbrand.com." };
  if (!isModelConfigured) return { error: "OPENAI_API_KEY is not set, so TRND cannot read your site yet." };

  let discovery;
  let socials;
  let rivals;
  try {
    const page = await readSitePage(url);
    socials = page.socials;
    discovery = await discoverRivals(url, page.text);
    // The most direct ten take the seats now; the rest wait as spares for the first scan to swap in if a seat runs no ads.
    rivals = rankCandidates(discovery.rivals);
  } catch (err) {
    console.warn("[setup] discovery failed:", (err as Error).message);
    return { error: `We couldn't read ${url}. Check the address and try again.` };
  }

  const sb = adminSupabase();
  const { data: brand, error } = await sb
    .from("brands")
    .upsert(
      { owner_id: user.id, url, name: discovery.name, summary: discovery.summary, category: discovery.category, profile: discovery.profile, candidates: { spares: rivals.spares.map(toSpare), swapped: [] } },
      { onConflict: "owner_id" },
    )
    .select("id")
    .single();
  if (error || !brand) return { error: error?.message ?? "Could not save the brand." };
  await sb.from("rivals").delete().eq("brand_id", brand.id).eq("source", "ai");
  // The brand itself, watched like a rival: replaced when the site changes.
  await sb.from("rivals").delete().eq("brand_id", brand.id).eq("is_self", true);
  await sb.from("rivals").insert({
    brand_id: brand.id,
    name: discovery.name,
    website: url.replace(/^https?:\/\//, ""),
    reason: "Your brand",
    source: "owner",
    is_self: true,
    instagram: socials.instagram ? normHandle(socials.instagram) : null,
    tiktok: socials.tiktok ? normHandle(socials.tiktok) : null,
    socials_checked_at: new Date().toISOString(),
  });
  await sb.from("rivals").insert(
    rivals.seated.slice(0, MAX_RIVALS).map((r) => ({ brand_id: brand.id, name: r.name, website: r.website || null, reason: r.reason, source: "ai" })),
  );
  redirect("/app/setup");
}

export async function addRivalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { brand } = await requireBrand();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const website = String(formData.get("website") ?? "").trim().slice(0, 200);
  if (!name) return { error: "Enter the rival's name as it appears on Facebook." };
  const sb = adminSupabase();
  const { count } = await sb.from("rivals").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("is_self", false);
  if ((count ?? 0) >= MAX_RIVALS) return { error: `You can watch up to ${MAX_RIVALS} rivals. Remove one first.` };
  const { error } = await sb.from("rivals").insert({ brand_id: brand.id, name, website: website || null, source: "owner" });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return {};
}

export async function removeRivalAction(formData: FormData): Promise<void> {
  const { brand } = await requireBrand();
  await adminSupabase().from("rivals").delete().eq("id", String(formData.get("id"))).eq("brand_id", brand.id).eq("is_self", false);
  revalidatePath("/app", "layout");
}

/** Set or correct a company's Instagram and TikTok handles (the brand's own included). */
export async function updateHandlesAction(formData: FormData): Promise<void> {
  const { brand } = await requireBrand();
  const clean = (v: FormDataEntryValue | null) => {
    const h = normHandle(String(v ?? "")).slice(0, 40);
    return /^[a-z0-9._]{2,40}$/.test(h) ? h : null;
  };
  await adminSupabase()
    .from("rivals")
    .update({ instagram: clean(formData.get("instagram")), tiktok: clean(formData.get("tiktok")), socials_checked_at: new Date().toISOString() })
    .eq("id", String(formData.get("id")))
    .eq("brand_id", brand.id);
  revalidatePath("/app", "layout");
}

/**
 * The owner names a company's Facebook Page (or corrects the one we found).
 * The ads read from the old Page go, the new Page's first read is a baseline,
 * and a scan starts.
 */
export async function setPageAction(_prev: FormState & { saved?: boolean }, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const { brand } = await requireBrand();
  const id = String(formData.get("id") ?? "");
  const sb = adminSupabase();
  const { data: rival } = await sb.from("rivals").select("id, name, page_id").eq("id", id).eq("brand_id", brand.id).maybeSingle<{ id: string; name: string; page_id: string | null }>();
  if (!rival) return { error: "That company is no longer on your list." };
  const page = await pageFromInput(String(formData.get("page") ?? "").slice(0, 500));
  if (!page) return { error: "We couldn't find that Page. Paste its facebook.com link or its Ad Library link." };
  if (page.pageId !== rival.page_id) {
    await sb.from("ads").delete().eq("rival_id", rival.id);
    const { error } = await sb
      .from("rivals")
      .update({ page_id: page.pageId, page_name: page.pageName || rival.name, last_scraped_at: null, last_error: null })
      .eq("id", rival.id);
    if (error) return { error: error.message };
  }
  // Separate so it works before 0102_page_source.sql has run.
  await sb.from("rivals").update({ page_source: "owner" }).eq("id", rival.id);
  if (!isScanning(brand)) {
    await sb.from("brands").update({ scan_status: "running", scan_error: null, scan_started_at: new Date().toISOString() }).eq("id", brand.id);
    after(() => scanBrand(brand.id, { forceReport: true }).catch((err) => console.warn("[scan] failed:", (err as Error).message)));
  }
  revalidatePath("/app", "layout");
  return { saved: true };
}

/** The owner's corrections to the brand profile every report is written against. */
export async function updateProfileAction(_prev: FormState & { saved?: boolean }, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const { brand } = await requireBrand();
  const text = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 600);
  const lines = (k: string) =>
    text(k)
      .split(/\n+/)
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
  const parsed = ProfileSchema.safeParse({
    what_it_sells: text("what_it_sells"),
    price_point: text("price_point"),
    price_tier: text("price_tier") || "unknown",
    audience: text("audience"),
    value_props: lines("value_props"),
    proof_points: lines("proof_points"),
    offers: lines("offers"),
    tone: text("tone"),
    differentiators: lines("differentiators"),
  });
  if (!parsed.success) return { error: "Check the price tier and try again." };
  const { error } = await adminSupabase().from("brands").update({ profile: parsed.data }).eq("id", brand.id);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { saved: true };
}

/** Start a scan now and return at once; the dashboard polls until it is done. */
export async function scanNowAction(): Promise<void> {
  const { brand } = await requireBrand();
  if (isScanning(brand)) redirect("/app");
  // A scan cut short resumes regardless of when it started (lib/scan.ts reads brands.scan_state).
  const resuming = brand.scan_status === "running" && Boolean(brand.scan_state);
  if (!resuming && brand.last_scan_at && Date.now() - Date.parse(brand.last_scan_at) < SCAN_MIN_GAP_MS) redirect("/app?scan=recent");
  if (!resuming) {
    await adminSupabase().from("brands").update({ scan_status: "running", scan_error: null, scan_started_at: new Date().toISOString() }).eq("id", brand.id);
  }
  after(() => scanBrand(brand.id, { forceReport: true }).catch((err) => console.warn("[scan] failed:", (err as Error).message)));
  redirect("/app");
}

export async function checkoutAction(): Promise<void> {
  const { user, brand } = await requireBrand();
  if (!isStripeConfigured) redirect("/app/settings?billing=unconfigured");
  const { createCheckoutSession } = await import("@/lib/billing/stripe");
  redirect(await createCheckoutSession(brand, user.email));
}

export async function billingPortalAction(): Promise<void> {
  const { brand } = await requireBrand();
  if (!isStripeConfigured || !brand.stripe_customer_id) redirect("/app/settings");
  const { createPortalSession } = await import("@/lib/billing/stripe");
  redirect(await createPortalSession(brand.stripe_customer_id));
}

const GOALS = ["new_customers", "subscriptions", "launch", "retention", "awareness"] as const;

/** What the brand is trying to do right now. */
export async function updateObjectivesAction(_prev: FormState & { saved?: boolean }, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const { brand } = await requireBrand();
  const text = (k: string, max = 200) => String(formData.get(k) ?? "").trim().slice(0, max);
  const goal = text("goal");
  if (!(GOALS as readonly string[]).includes(goal)) return { error: "Pick a goal." };
  const objectives = { goal, monthly_budget: text("monthly_budget"), target_cost: text("target_cost"), focus: text("focus"), notes: text("notes", 600) };
  const { error } = await adminSupabase().from("brands").update({ objectives }).eq("id", brand.id);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { saved: true };
}

/** An Ads Manager export (CSV): replaces the brand's past results. */
export async function uploadResultsAction(_prev: FormState & { count?: number }, formData: FormData): Promise<FormState & { count?: number }> {
  const { brand } = await requireBrand();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a CSV exported from Ads Manager." };
  if (file.size > 4_000_000) return { error: "That file is over 4 MB. Export fewer columns or a shorter date range." };
  let rows;
  try {
    rows = parseAdsExport(await file.text());
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!rows.length) return { error: "No ads found in that file. Export at the Ads level, with Ad name as a column." };
  const sb = adminSupabase();
  await sb.from("own_ad_results").delete().eq("brand_id", brand.id);
  const { error } = await sb.from("own_ad_results").insert(rows.slice(0, 2000).map((r) => ({ ...r, brand_id: brand.id })));
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { count: rows.length };
}

export async function clearResultsAction(): Promise<void> {
  const { brand } = await requireBrand();
  await adminSupabase().from("own_ad_results").delete().eq("brand_id", brand.id);
  revalidatePath("/app", "layout");
}
