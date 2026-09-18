import type { Repo } from "@/lib/db/repo";
import type { AdHistory, BrandPick, PickRun, PickRunStatus } from "@/lib/db/types";
import { runCampaignName, runTrackingName, type RunResults } from "@/lib/picks/list";

/**
 * The brand's own ad history, written onto the creative tests it belongs
 * to.
 *
 * A brief is handed to a creator and the ad runs in the brand's own Ads
 * Manager; TRND never launches it. So the only honest way for its numbers
 * to come back is by name: the brief says what to call the ad, and every
 * row that arrives in ad history carrying that name (from the connected
 * account's daily sync, or from an export the owner uploads) is summed onto
 * the run. The run goes live the first time it shows delivery. It is never
 * closed by this: an export has no "ended" in it, and the owner's own
 * "mark completed" is the only close, with these numbers already filled in.
 *
 * What it never does: give a verdict, touch a run the owner stopped, or
 * reopen one that ended.
 */

const normalize = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** The history rows that carry this run's tracking name in their ad or
 * campaign name, or the run's own completion row. */
export function historyRowsForRun(rows: AdHistory[], pick: Pick<BrandPick, "term" | "concept_title">): AdHistory[] {
  const tracking = normalize(runTrackingName(pick));
  const own = normalize(runCampaignName(pick));
  return rows.filter((r) => {
    const ad = normalize(r.ad_name);
    const campaign = normalize(r.campaign_name);
    return ad.includes(tracking) || campaign.includes(tracking) || campaign === own;
  });
}

const add = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);

/** Pure: the matched rows summed into the run's numbers. Revenue is not in
 * an export or the account insights as stored, so it stays the owner's. */
export function resultsFromRows(rows: AdHistory[]): RunResults {
  let impressions: number | null = null;
  let clicks: number | null = null;
  let spendCents: number | null = null;
  let results: number | null = null;
  for (const r of rows) {
    impressions = add(impressions, r.impressions);
    clicks = add(clicks, r.clicks);
    spendCents = add(spendCents, r.spend_cents);
    results = add(results, r.results);
  }
  return {
    spend_usd: spendCents === null ? null : Math.round(spendCents) / 100,
    impressions,
    clicks,
    conversions: results === null ? null : Math.round(results),
    revenue_usd: null,
  };
}

const delivered = (r: RunResults) => (r.impressions ?? 0) > 0 || (r.clicks ?? 0) > 0 || (r.spend_usd ?? 0) > 0;

/** The day the matched ads started, as the run's launch time, else now. */
function launchedAt(rows: AdHistory[], now: Date): string {
  const days = rows.map((r) => r.started_on).filter((d): d is string => typeof d === "string" && d.length >= 10).sort();
  return days.length > 0 ? new Date(`${days[0]}T12:00:00Z`).toISOString() : now.toISOString();
}

export interface RunSyncResult {
  runId: string;
  status: PickRunStatus;
  /** How many history rows carried the run's name. */
  matched: number;
}

/**
 * Every open test of one brand, filled from its ad history. Returns the
 * runs that received numbers; a run with nothing named for it is left as it
 * was. Never throws: it runs inside a cron loop and after an upload.
 */
export async function syncRunsFromHistory(repo: Repo, businessId: string, now = new Date()): Promise<RunSyncResult[]> {
  const out: RunSyncResult[] = [];
  let runs: { run: PickRun; pick: BrandPick }[];
  let history: AdHistory[];
  try {
    [runs, history] = await Promise.all([repo.listPickRuns(businessId), repo.listAdHistory(businessId)]);
  } catch (err) {
    console.warn(`[ads:runs] reading ${businessId} failed:`, (err as Error).message);
    return out;
  }
  if (history.length === 0) return out;
  for (const { run, pick } of runs) {
    if (run.status !== "planned" && run.status !== "running") continue;
    const rows = historyRowsForRun(history, pick);
    if (rows.length === 0) continue;
    const results = resultsFromRows(rows);
    // The owner's own revenue figure, when they typed one, is kept.
    const patch: Parameters<Repo["updatePickRun"]>[1] = { ...results, revenue_usd: run.revenue_usd ?? null };
    let status: PickRunStatus = run.status;
    if (status === "planned" && delivered(results)) {
      status = "running";
      patch.status = status;
      patch.launched_at = launchedAt(rows, now);
    }
    try {
      await repo.updatePickRun(run.id, patch);
      out.push({ runId: run.id, status, matched: rows.length });
    } catch (err) {
      console.warn(`[ads:runs] run ${run.id} not updated:`, (err as Error).message);
    }
  }
  return out;
}
