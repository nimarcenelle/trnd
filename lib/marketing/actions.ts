"use server";

import { after } from "next/server";

import { getAnonRepo } from "@/lib/db";
import { notifyFounder } from "@/lib/notify";

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
  const category = String(formData.get("category") ?? "").trim().slice(0, 60);
  const website = String(formData.get("website") ?? "").trim().slice(0, 200);
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
    website: website || null,
    monthly_spend: monthlySpend || null,
  });
  // A lead that lands silently in a table is a lead lost — tell the founder,
  // after the response so the form never waits on it.
  after(() =>
    notifyFounder({
      kind: "demo_request",
      fullName,
      email,
      businessName,
      category: category || null,
      website: website || null,
      monthlySpend: monthlySpend || null,
    }),
  );
  return { ok: true };
}

export interface PilotApplicationState {
  ok?: boolean;
  error?: string;
}

/**
 * An application to the founder-assisted pilot. Stored on its own table,
 * and the founder is told after the response. Nothing here starts a trial,
 * a scan or a charge: the pilot begins with a conversation.
 */
export async function submitPilotApplicationAction(_prev: PilotApplicationState, formData: FormData): Promise<PilotApplicationState> {
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const brandName = String(formData.get("brand_name") ?? "").trim().slice(0, 120);
  const website = String(formData.get("website") ?? "").trim().slice(0, 200);
  const monthlySpend = String(formData.get("monthly_spend") ?? "").trim().slice(0, 60);
  const objective = String(formData.get("objective") ?? "").trim().slice(0, 40);
  const production = String(formData.get("production") ?? "").trim().slice(0, 200);
  const whatNext = String(formData.get("what_next") ?? "").trim().slice(0, 800);

  if (!fullName || !brandName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Fill in your name, work email and brand first." };
  }

  const repo = await getAnonRepo();
  await repo.insertPilotApplication({
    full_name: fullName,
    email,
    brand_name: brandName,
    website: website || null,
    monthly_spend: monthlySpend || null,
    objective: objective || null,
    runs_meta_ads: monthlySpend ? !/not running/i.test(monthlySpend) : null,
    production: production || null,
    what_next: whatNext || null,
  });
  after(() =>
    notifyFounder({
      kind: "pilot_application",
      fullName,
      email,
      brandName,
      website: website || null,
      monthlySpend: monthlySpend || null,
      objective: objective || null,
      production: production || null,
      whatNext: whatNext || null,
    }),
  );
  return { ok: true };
}
