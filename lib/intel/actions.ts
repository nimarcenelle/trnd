"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import type { SocialHandles } from "@/lib/db/types";
import { cleanSocialHandles, SOCIAL_PLATFORMS } from "@/lib/import/social-links";
import { normalizeHandle } from "@/lib/social";
import { enrichCompetitor } from "@/lib/intel/direct";
import { runIntelIngestForBusiness } from "@/lib/intel/ingest";

/** Add a named competitor and read it in the background right away. */
export async function addCompetitorAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const website = String(formData.get("website") ?? "").trim().slice(0, 200) || null;
  if (!name) return;
  const competitor = await repo.createCompetitor({ business_id: business.id, name, website, place_id: null });
  after(async () => {
    const jobRepo = getAdminRepo();
    // Read their site first, so the first intel read already knows their
    // handles and how directly they compete. enrichCompetitor never throws.
    await enrichCompetitor(jobRepo, business, competitor);
    try {
      await runIntelIngestForBusiness(jobRepo, business);
    } catch (err) {
      console.warn("[intel] first competitor read failed (non-fatal):", (err as Error).message);
    }
  });
  revalidatePath("/app/settings");
}

/** Find the nearest same-category rivals and start watching them. */
export async function seedCompetitorsAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const { seedCompetitors } = await import("@/lib/intel/seed-competitors");
  let created = 0;
  try {
    created = (await seedCompetitors(repo, business)).created.length;
  } catch (err) {
    console.warn("[intel] rival discovery failed:", (err as Error).message);
  }
  if (created > 0) {
    after(async () => {
      try {
        await runIntelIngestForBusiness(getAdminRepo(), business);
      } catch (err) {
        console.warn("[intel] first rival read failed (non-fatal):", (err as Error).message);
      }
    });
  }
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

export async function deleteCompetitorAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  await repo.deleteCompetitor(String(formData.get("competitor_id") ?? ""));
  revalidatePath("/app/settings");
}

/** The three handle inputs, as pasted (URL or @handle), cut to what we
 * store. A blank input clears that platform. */
function handlesFromForm(formData: FormData): SocialHandles {
  const raw: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    raw[platform] = normalizeHandle(platform, String(formData.get(platform) ?? "").slice(0, 300));
  }
  return cleanSocialHandles(raw);
}

/** Set a rival's Instagram, TikTok and Facebook by hand, for the rivals
 * whose site doesn't link them, then read their posts in the background. */
export async function updateCompetitorHandlesAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const id = String(formData.get("competitor_id") ?? "");
  const competitor = (await repo.listCompetitors(business.id)).find((c) => c.id === id);
  if (!competitor) return;
  await repo.updateCompetitor(competitor.id, { social_handles: handlesFromForm(formData) });
  after(async () => {
    try {
      await runIntelIngestForBusiness(getAdminRepo(), business);
    } catch (err) {
      console.warn("[intel] rival accounts read failed (non-fatal):", (err as Error).message);
    }
  });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

export async function markAlertsReadAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) return;
  await repo.markAlertsRead(business.id);
  revalidatePath("/app", "layout");
}

export async function disconnectMetaAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) return;
  await repo.deleteConnection(business.id, "meta");
  revalidatePath("/app/settings");
}
