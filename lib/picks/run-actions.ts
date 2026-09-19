"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { syncRunsFromHistory } from "@/lib/ads/run-sync";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { Repo } from "@/lib/db/repo";
import type { PickRun, PickRunStatus } from "@/lib/db/types";
import { parseRunResults, parseVerdict, runAdHistoryRow, runCampaignName, withSyncedNumbers } from "@/lib/picks/list";
import { runLift } from "@/lib/record/calibration";

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

async function ownedRun(
  formData: FormData,
  status: PickRunStatus,
): Promise<{ repo: Repo; run: PickRun; pickId: string } | null> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");

  const runId = String(formData.get("run_id") ?? "").trim();
  if (!runId) return null;
  const owned = (await repo.listPickRuns(business.id)).find((r) => r.run.id === runId);
  if (!owned || owned.run.status !== status) return null;
  return { repo, run: owned.run, pickId: owned.pick.id };
}

const ownedRunningRun = (formData: FormData) => ownedRun(formData, "running");

/** What the test taught, in the owner's words: trimmed, capped, empty is null. */
export async function cleanLearned(raw: unknown): Promise<string | null> {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? Array.from(t).slice(0, 600).join("") : null;
}

/**
 * "This is the ad": the owner points a synced or uploaded ad at a test by
 * id, so a media buyer who did not follow the naming convention can still
 * hand the test its numbers. The row and the run must both be this brand's.
 */
export async function linkAdToRunAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const runId = String(formData.get("run_id") ?? "").trim();
  const adId = String(formData.get("ad_id") ?? "").trim();
  const unlink = String(formData.get("unlink") ?? "") === "1";
  if (!runId || !adId) return;
  const owned = (await repo.listPickRuns(business.id)).find((r) => r.run.id === runId);
  if (!owned || (owned.run.status !== "planned" && owned.run.status !== "running")) return;
  const row = (await repo.listAdHistory(business.id)).find((r) => r.id === adId);
  if (!row) return;
  await repo.linkAdHistoryToRun(row.id, unlink ? null : runId);
  // The link is the numbers: fill them now rather than on tomorrow's sync.
  await syncRunsFromHistory(repo, business.id);
  revalidateRunScreens();
}

export interface FidelityState {
  error?: string;
  ok?: boolean;
  line?: string;
}

/**
 * The finished ad checked against its brief. The owner pastes the ad's
 * words (script, captions, copy); with nothing pasted, the words of the ad
 * linked to this test are read instead. The read lands on the run so the
 * Track record can count a wrong concept and a wrong shoot apart.
 */
export async function checkRunFidelityAction(_prev: FidelityState, formData: FormData): Promise<FidelityState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const runId = String(formData.get("run_id") ?? "").trim();
  const owned = (await repo.listPickRuns(business.id)).find((r) => r.run.id === runId);
  if (!owned) return { error: "That test could not be found." };
  const brief = owned.pick.brief;
  if (!brief) return { error: "This test has no brief to check against." };

  let text = String(formData.get("ad_text") ?? "").trim();
  let source: "pasted" | "linked" = "pasted";
  if (!text) {
    const linked = (await repo.listAdHistory(business.id).catch(() => [])).filter((r) => r.run_id === runId && r.copy);
    text = linked.map((r) => r.copy as string).join("\n\n").trim();
    source = "linked";
    if (!text) return { error: "Paste the ad's words (its script, captions or copy), or link the ad to this test first." };
  }
  if (text.length < 12) return { error: "That is too short to check. Paste the whole script or copy." };

  const { checkFidelity, fidelityLine } = await import("@/lib/picks/fidelity");
  const { read, score } = await checkFidelity(brief, text, source);
  await repo.updatePickRun(owned.run.id, { fidelity_score: score, fidelity_read: read });
  revalidateRunScreens();
  return { ok: true, line: fidelityLine(read, score) };
}

/** "Mark launched" from Campaigns: a planned test goes live. */
export async function launchRunAction(formData: FormData): Promise<void> {
  const owned = await ownedRun(formData, "planned");
  if (!owned) return;
  await owned.repo.updatePickRun(owned.run.id, { status: "running", launched_at: new Date().toISOString() });
  revalidateRunScreens();
}

function revalidateRunScreens() {
  // The chip shows in three places: Campaigns, the list row, the pick itself.
  revalidatePath("/app/campaigns");
  revalidatePath("/app/picks");
  revalidatePath("/app/picks/[id]", "page");
  revalidatePath("/app/record");
}

/**
 * Closes a run with whatever results the owner has. Every number is
 * optional; a bad one returns an error and writes nothing. Delivery numbers
 * also become a row in the brand's own ad history, so the Brand signal's
 * baseline learns from the run directly, and the run keeps the account
 * click-through it was judged against and its lift over it: the actual
 * beside the pick's predicted grade, for the calibration log.
 */
export async function completePickRunAction(_prev: CompleteRunState, formData: FormData): Promise<CompleteRunState> {
  const parsed = parseRunResults(formData);
  if (!parsed.ok) return { error: parsed.error };
  const owned = await ownedRunningRun(formData);
  if (!owned) return {};
  const { repo, run, pickId } = owned;
  // A blank on the form never erases a number the account sync already put
  // on the run; the owner's figure wins wherever they gave one.
  const results = withSyncedNumbers(parsed.results, run);
  const endedAt = new Date();

  // The baseline is read before this run's own row lands in the history.
  let detail: Awaited<ReturnType<Repo["getPickDetail"]>> = null;
  let cal = { baselineCtr: null as number | null, lift: null as number | null };
  try {
    detail = await repo.getPickDetail(pickId);
    const history = await repo.listAdHistory(run.business_id);
    cal = runLift(results, history, detail ? runCampaignName(detail.pick) : undefined);
  } catch (err) {
    console.warn("[picks] baseline for the run not read (non-fatal):", (err as Error).message);
  }

  await repo.updatePickRun(run.id, {
    status: "completed",
    ended_at: endedAt.toISOString(),
    verdict: parseVerdict(formData),
    learned: await cleanLearned(formData.get("learned")),
    spend_usd: results.spend_usd,
    impressions: results.impressions,
    clicks: results.clicks,
    conversions: results.conversions,
    revenue_usd: results.revenue_usd,
    baseline_ctr: cal.baselineCtr,
    lift: cal.lift,
  });

  if (results.impressions !== null || results.clicks !== null) {
    try {
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

async function endRun(formData: FormData, status: Exclude<PickRunStatus, "running" | "planned">): Promise<void> {
  const owned = await ownedRunningRun(formData);
  if (!owned) return;
  await owned.repo.updatePickRun(owned.run.id, { status, ended_at: new Date().toISOString(), learned: await cleanLearned(formData.get("learned")) });
  revalidateRunScreens();
}

export async function killPickRunAction(formData: FormData): Promise<void> {
  await endRun(formData, "killed");
}
