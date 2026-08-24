"use server";

import { getAnonRepo } from "@/lib/db";

export interface DemoRequestState {
  ok?: boolean;
  error?: string;
}

export async function submitDemoRequestAction(
  _prev: DemoRequestState,
  formData: FormData,
): Promise<DemoRequestState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const monthlySpend = String(formData.get("monthly_spend") ?? "").trim();

  if (!fullName || !businessName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Fill in your name, work email, and business name first." };
  }

  const repo = await getAnonRepo();
  await repo.insertDemoRequest({
    full_name: fullName,
    email,
    business_name: businessName,
    category: category || null,
    monthly_spend: monthlySpend || null,
  });
  return { ok: true };
}
