"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import type { SocialHandles } from "@/lib/db/types";
import { cleanSocialHandles, SOCIAL_PLATFORMS } from "@/lib/import/social-links";
import { runIntelIngestForBusiness } from "@/lib/intel/ingest";
import { parseCreativeContext } from "@/lib/onboarding/context";
import { parseMarketProfile } from "@/lib/onboarding/market";
import { normalizeHandle } from "@/lib/social";

/** The three handle inputs, as pasted (URL or @handle), cut to what we
 * store. A blank input clears that platform. */
function handlesFromForm(formData: FormData): SocialHandles {
  const raw: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    raw[platform] = normalizeHandle(platform, String(formData.get(platform) ?? "").slice(0, 300));
  }
  return cleanSocialHandles(raw);
}

export interface SettingsState {
  error?: string;
  ok?: boolean;
}

/**
 * The analysis is a read of the profile, so profile edits stale it.
 * Regenerate after the response is sent — saves stay instant, and a failed
 * regeneration just leaves the previous analysis in place.
 */
function refreshBriefAfterResponse(userId: string) {
  after(async () => {
    try {
      const repo = await getUserRepo(userId);
      const business = await repo.getBusinessByOwner(userId);
      if (!business) return;
      const services = await repo.listServices(business.id);
      await repo.upsertBusinessBrief(await generateBusinessBrief(business, services));
      // The profile (and so the analysis) changed — what fits changed too.
      const { rerankWeek } = await import("@/lib/recommend/rerank");
      const { getAdminRepo } = await import("@/lib/db/admin");
      await rerankWeek(getAdminRepo(), business);
    } catch (err) {
      console.warn("[settings] brief refresh failed (non-fatal):", (err as Error).message);
    }
  });
}

export async function updateBusinessAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name) return { error: "Name is required." };
  // An online brand may have set up without a city; only a place needs one.
  if (!city && business.market === "local") return { error: "Name and city are required." };
  if (category.length < 3 || category.length > 60) return { error: "Describe what your business is (a few words)." };

  const radius = Number(formData.get("radius_miles") ?? business.radius_miles);
  await repo.updateBusiness(business.id, {
    name,
    category,
    city,
    region: String(formData.get("region") ?? "").trim() || null,
    website: String(formData.get("website") ?? "").trim() || null,
    price_band: String(formData.get("price_band") ?? "").trim() || null,
    brand_voice_notes: String(formData.get("brand_voice_notes") ?? "").trim() || null,
    radius_miles: Number.isFinite(radius) ? Math.min(100, Math.max(1, Math.round(radius))) : business.radius_miles,
  });
  refreshBriefAfterResponse(user.id);
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** The creative context every brief reads: objective, formats, the lead product, recent creative, claims. */
export async function updateCreativeContextAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const context = parseCreativeContext(formData);
  const wanted = String(formData.get("priority_service_id") ?? "").trim();
  const services = await repo.listServices(business.id);
  const priority = services.find((s) => s.id === wanted)?.id ?? null;
  await repo.updateBusiness(business.id, { ...context, priority_service_id: priority });
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function addServiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const priceRaw = String(formData.get("price") ?? "").replace(/[^0-9.]/g, "");
  const cents = priceRaw ? Math.round(parseFloat(priceRaw) * 100) : null;
  await repo.createServices([
    {
      business_id: business.id,
      name,
      description: null,
      price_cents: cents && cents > 0 ? cents : null,
      is_active: true,
    },
  ]);
  refreshBriefAfterResponse(user.id);
  revalidatePath("/app/settings");
}

export async function toggleServiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const id = String(formData.get("service_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await repo.updateService(id, { is_active: active });
  refreshBriefAfterResponse(user.id);
  revalidatePath("/app/settings");
}

/** The owner's own Instagram, TikTok and Facebook. Saved, then their posts
 * are read in the background so the brand signal has them next pick. */
export async function updateSocialHandlesAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const updated = await repo.updateBusiness(business.id, { social_handles: handlesFromForm(formData) });
  after(async () => {
    try {
      await runIntelIngestForBusiness(getAdminRepo(), updated);
    } catch (err) {
      console.warn("[settings] own accounts read failed (non-fatal):", (err as Error).message);
    }
  });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** How they sell, what they spend on paid social, and where. The controls
 * only offer allowed values, so a post that fails validation was built by
 * hand and is dropped without saving. */
export async function updateBusinessProfileAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const parsed = parseMarketProfile(
    {
      market: formData.get("market"),
      spend: formData.get("monthly_ad_spend"),
      platforms: formData.getAll("ad_platforms"),
    },
    business.market,
  );
  if ("error" in parsed) return;
  await repo.updateBusiness(business.id, parsed.profile);
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  await repo.deleteService(String(formData.get("service_id") ?? ""));
  refreshBriefAfterResponse(user.id);
  revalidatePath("/app/settings");
}
