"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { CATEGORIES } from "@/lib/db/types";

export interface SettingsState {
  error?: string;
  ok?: boolean;
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
  if (!name || !city) return { error: "Name and city are required." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { error: "Pick a category." };

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
  revalidatePath("/app/settings");
}

export async function toggleServiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const id = String(formData.get("service_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await repo.updateService(id, { is_active: active });
  revalidatePath("/app/settings");
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  await repo.deleteService(String(formData.get("service_id") ?? ""));
  revalidatePath("/app/settings");
}
