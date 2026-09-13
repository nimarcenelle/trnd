"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { Repo } from "@/lib/db/repo";
import type { PickRun, PickRunStatus } from "@/lib/db/types";
import { parseRunResults, runAdHistoryRow } from "@/lib/picks/list";

/**
 * Ending a run from Campaigns. The run id arrives from a form, so it is
 * matched against this owner's own runs before anything is written: a forged
 * or stale id is a quiet no-op, not an error page. Only a running run can end;
 * a double-submit on an ended one changes nothing.
 */

export interface CompleteRunState {
  error?: string;
  ok?: boolean;
}

async function ownedRunningRun(
  formData: FormData,
): Promise<{ repo: Repo; run: PickRun; pickId: string } | null> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const runId = String(formData.get("run_id") ?? "").trim();
  if (!runId) return null;
  const owned = (await repo.listPickRuns(business.id)).find((r) => r.run.id === runId);
  if (!owned || owned.run.status !== "running") return null;
  return { repo, run: owned.run, pickId: owned.pick.id };
}

function revalidateRunScreens() {
  // The chip shows in three places: Campaigns, the list row, the pick itself.
  revalidatePath("/app/campaigns");
  revalidatePath("/app/picks");
  revalidatePath("/app/picks/[id]", "page");
}

/**
 * Closes a run with whatever results the owner has. Every number is
 * optional; a bad one returns an error and writes nothing. Delivery numbers
 * also become a row in the brand's own ad history, so the Brand signal's
 * baseline learns from the run directly.
 */
export async function completePickRunAction(_prev: CompleteRunState, formData: FormData): Promise<CompleteRunState> {
  const parsed = parseRunResults(formData);
  if (!parsed.ok) return { error: parsed.error };
  const owned = await ownedRunningRun(formData);
  if (!owned) return {};
  const { repo, run, pickId } = owned;
  const { results } = parsed;
  const endedAt = new Date();

  await repo.updatePickRun(run.id, {
    status: "completed",
    ended_at: endedAt.toISOString(),
    spend_usd: results.spend_usd,
    impressions: results.impressions,
    clicks: results.clicks,
    conversions: results.conversions,
    revenue_usd: results.revenue_usd,
  });

  if (results.impressions !== null || results.clicks !== null) {
    try {
      const detail = await repo.getPickDetail(pickId);
      const row = detail ? runAdHistoryRow({ pick: detail.pick, scripts: detail.scripts, run, results, endedAt }) : null;
      if (row) await repo.upsertAdHistory([row]);
    } catch (err) {
      // The run is closed either way; the baseline catches up on the next import.
      console.warn("[picks] run results to ad history failed (non-fatal):", (err as Error).message);
    }
  }

  revalidateRunScreens();
  return { ok: true };
}

async function endRun(formData: FormData, status: Exclude<PickRunStatus, "running">): Promise<void> {
  const owned = await ownedRunningRun(formData);
  if (!owned) return;
  await owned.repo.updatePickRun(owned.run.id, { status, ended_at: new Date().toISOString() });
  revalidateRunScreens();
}

export async function killPickRunAction(formData: FormData): Promise<void> {
  await endRun(formData, "killed");
}
