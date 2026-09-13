"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { PickRunStatus } from "@/lib/db/types";

/**
 * Ending a run from Campaigns. The run id arrives from a form, so it is
 * matched against this owner's own runs before anything is written: a forged
 * or stale id is a quiet no-op, not an error page. Only a running run can end;
 * a double-submit on an ended one changes nothing.
 */
async function endRun(formData: FormData, status: Exclude<PickRunStatus, "running">): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const runId = String(formData.get("run_id") ?? "").trim();
  if (!runId) return;
  const owned = (await repo.listPickRuns(business.id)).find((r) => r.run.id === runId);
  if (!owned || owned.run.status !== "running") return;

  await repo.updatePickRun(runId, { status, ended_at: new Date().toISOString() });
  // The chip shows in three places: Campaigns, the list row, the pick itself.
  revalidatePath("/app/campaigns");
  revalidatePath("/app/picks");
  revalidatePath("/app/picks/[id]", "page");
}

export async function completePickRunAction(formData: FormData): Promise<void> {
  await endRun(formData, "completed");
}

export async function killPickRunAction(formData: FormData): Promise<void> {
  await endRun(formData, "killed");
}
