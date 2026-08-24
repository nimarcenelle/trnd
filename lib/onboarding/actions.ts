"use server";

import { redirect } from "next/navigation";

import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { CATEGORIES } from "@/lib/db/types";

export interface OnboardingState {
  error?: string;
}

interface ServiceInput {
  name: string;
  price: string;
}

export async function completeOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const priceBand = String(formData.get("price_band") ?? "").trim();
  const brandVoice = String(formData.get("brand_voice_notes") ?? "").trim();
  const radius = Number(formData.get("radius_miles") ?? 20);

  if (!name) return { error: "Business name is required." };
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Pick a category." };
  }
  if (!city) return { error: "City is required." };

  let services: ServiceInput[] = [];
  try {
    services = JSON.parse(String(formData.get("services") ?? "[]")) as ServiceInput[];
  } catch {
    return { error: "Services could not be read — try again." };
  }
  const cleanServices = services
    .map((s) => ({ name: s.name.trim(), price: s.price.trim() }))
    .filter((s) => s.name.length > 0);
  if (cleanServices.length === 0) {
    return { error: "Add at least one service you sell." };
  }

  const repo = await getUserRepo(user.id);
  const existing = await repo.getBusinessByOwner(user.id);
  if (existing) redirect("/app");

  const business = await repo.createBusiness({
    owner_id: user.id,
    name,
    category,
    city,
    region: region || null,
    country: "US",
    lat: null,
    lng: null,
    radius_miles: Number.isFinite(radius) ? Math.min(100, Math.max(1, Math.round(radius))) : 20,
    website: website || null,
    price_band: priceBand || null,
    brand_voice_notes: brandVoice || null,
  });

  const createdServices = await repo.createServices(
    cleanServices.map((s) => {
      const parsed = Math.round(parseFloat(s.price.replace(/[^0-9.]/g, "")) * 100);
      return {
        business_id: business.id,
        name: s.name,
        description: null,
        price_cents: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
        is_active: true,
      };
    }),
  );

  // The joining gift: TRND's full analysis of the business — positioning,
  // customers, market, pricing, seasonality, and first moves. The site text
  // the import already fetched feeds it, so no refetch here. Deterministic
  // fallback is instant; Gemini takes over transparently when configured.
  const siteText = String(formData.get("site_text") ?? "").slice(0, 12_000) || undefined;
  try {
    const brief = await generateBusinessBrief(business, createdServices, siteText);
    await repo.upsertBusinessBrief(brief);
  } catch (err) {
    console.warn("[onboarding] brief generation failed (non-fatal):", (err as Error).message);
  }

  redirect("/app");
}
