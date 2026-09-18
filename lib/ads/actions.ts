"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

/** Same cap the documents upload uses for a spreadsheet. An Ads Manager
 * export for a small account is tens of kilobytes. */
const MAX_AD_EXPORT_BYTES = 5 * 1024 * 1024;

function revalidateAdSurfaces() {
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** The notice travels as a code plus numbers, never as free text, so a
 * crafted link can't put words on the Settings page. */
function back(code: string, extra: Record<string, number> = {}): never {
  const q = new URLSearchParams({ ads: code });
  for (const [k, v] of Object.entries(extra)) if (v > 0) q.set(k, String(Math.round(v)));
  redirect(`/app/settings?${q.toString()}#ads`);
}

/**
 * Read an Ads Manager or Google Ads export into the owner's ad history.
 * A re-upload from the same platform replaces that platform's rows, so
 * exporting a longer date range next month never double counts an ad.
 */
export async function importAdExportAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("nofile");
  if (file.size > MAX_AD_EXPORT_BYTES) back("toobig");

  // The parser carries the xlsx reader; loaded here so the Settings route's
  // module graph stays free of it until an owner actually uploads a file.
  const { MAX_AD_HISTORY_ROWS, parseAdExport } = await import("@/lib/ads/import");
  let read: ReturnType<typeof parseAdExport>;
  try {
    read = parseAdExport({ name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (err) {
    console.warn("[ads:import] read failed:", (err as Error).message);
    back("error");
  }
  if (!read.source || !read.platform) back("notexport");
  if (read.rows.length === 0) back("empty");

  const skipped = Number(read.warnings.map((w) => w.match(/^Skipped (\d+)/)?.[1]).find(Boolean) ?? 0);
  const trimmed = read.warnings.some((w) => w.includes(`kept the ${MAX_AD_HISTORY_ROWS}`));
  let written = 0;
  try {
    await repo.deleteAdHistory(business.id, { source: read.source });
    written = await repo.upsertAdHistory(read.rows.map((r) => ({ ...r, business_id: business.id })));
  } catch (err) {
    console.warn("[ads:import] save failed:", (err as Error).message);
    revalidateAdSurfaces();
    back("error");
  }
  // Rows named for an open creative test land on it now, not at the next cron.
  try {
    const { syncRunsFromHistory } = await import("@/lib/ads/run-sync");
    await syncRunsFromHistory(repo, business.id);
  } catch (err) {
    console.warn("[ads:import] runs from history failed (non-fatal):", (err as Error).message);
  }
  revalidateAdSurfaces();
  revalidatePath("/app/campaigns");
  revalidatePath("/app/record");
  back(trimmed ? "trimmed" : "imported", {
    n: written || read.rows.length,
    skipped,
    p: read.platform === "google" ? 2 : 1,
  });
}

/** Forget every imported ad. Synced rows come back on the next sync. */
export async function clearAdHistoryAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  try {
    await repo.deleteAdHistory(business.id);
  } catch (err) {
    console.warn("[ads:import] clear failed:", (err as Error).message);
    back("error");
  }
  revalidateAdSurfaces();
  back("cleared");
}
