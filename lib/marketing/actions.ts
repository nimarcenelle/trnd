"use server";

import { after } from "next/server";

import { getAnonRepo } from "@/lib/db";
import { notifyFounder } from "@/lib/notify";
import { objectiveList, parseObjectives } from "@/lib/onboarding/context";

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
  // Every campaign type ticked, kept as one readable line in the application.
  const objective = objectiveList(parseObjectives(formData.getAll("objective"))).slice(0, 80);
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
