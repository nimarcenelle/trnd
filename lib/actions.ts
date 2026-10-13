"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { discoverRivals } from "@/lib/ai/analyze";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/data";
import { adminSupabase } from "@/lib/db/supabase";
import { MAX_RIVALS } from "@/lib/db/types";
import { isModelConfigured, isStripeConfigured } from "@/lib/env";
import { isScanning } from "@/lib/format";
import { scanBrand } from "@/lib/scan";
import { normalizeUrl, readSite } from "@/lib/site";

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
  try {
    discovery = await discoverRivals(url, await readSite(url));
  } catch (err) {
    console.warn("[setup] discovery failed:", (err as Error).message);
    return { error: `We couldn't read ${url}. Check the address and try again.` };
  }

  const sb = adminSupabase();
  const { data: brand, error } = await sb
    .from("brands")
    .upsert({ owner_id: user.id, url, name: discovery.name, summary: discovery.summary, category: discovery.category }, { onConflict: "owner_id" })
    .select("id")
    .single();
  if (error || !brand) return { error: error?.message ?? "Could not save the brand." };
  await sb.from("rivals").delete().eq("brand_id", brand.id).eq("source", "ai");
  await sb.from("rivals").insert(
    discovery.rivals.slice(0, MAX_RIVALS).map((r) => ({ brand_id: brand.id, name: r.name, website: r.website || null, reason: r.reason, source: "ai" })),
  );
  redirect("/app/setup");
}

export async function addRivalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { brand } = await requireBrand();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const website = String(formData.get("website") ?? "").trim().slice(0, 200);
  if (!name) return { error: "Enter the rival's name as it appears on Facebook." };
  const sb = adminSupabase();
  const { count } = await sb.from("rivals").select("id", { count: "exact", head: true }).eq("brand_id", brand.id);
  if ((count ?? 0) >= MAX_RIVALS) return { error: `You can watch up to ${MAX_RIVALS} rivals. Remove one first.` };
  const { error } = await sb.from("rivals").insert({ brand_id: brand.id, name, website: website || null, source: "owner" });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return {};
}

export async function removeRivalAction(formData: FormData): Promise<void> {
  const { brand } = await requireBrand();
  await adminSupabase().from("rivals").delete().eq("id", String(formData.get("id"))).eq("brand_id", brand.id);
  revalidatePath("/app", "layout");
}

/** Start a scan now and return at once; the dashboard polls until it is done. */
export async function scanNowAction(): Promise<void> {
  const { brand } = await requireBrand();
  if (!isScanning(brand)) {
    await adminSupabase().from("brands").update({ scan_status: "running", scan_error: null, scan_started_at: new Date().toISOString() }).eq("id", brand.id);
    after(() => scanBrand(brand.id).catch((err) => console.warn("[scan] failed:", (err as Error).message)));
  }
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
