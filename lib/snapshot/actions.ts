"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

/** Owner-triggered regeneration of the founding analysis, e.g. after a menu
 * or positioning change they want reflected right away. */
export async function refreshSnapshotAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const services = await repo.listServices(business.id);
  try {
    await repo.upsertBusinessBrief(await generateBusinessBrief(business, services));
    // A changed analysis changes what fits — re-judge the week.
    const { rerankWeek } = await import("@/lib/recommend/rerank");
    const { getAdminRepo } = await import("@/lib/db/admin");
    await rerankWeek(getAdminRepo(), business);
  } catch (err) {
    console.warn("[snapshot] refresh failed (non-fatal):", (err as Error).message);
  }
  revalidatePath("/app/snapshot");
  revalidatePath("/app", "layout");
}