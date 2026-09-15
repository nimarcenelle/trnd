"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { cleanNote, isPickId, parseDismissReason, viewableDetail } from "@/lib/picks/detail";

/**
 * The decisions on a creative test, each its own verb with its own meaning:
 * chosen is not launched, launched is not successful, passed is not a
 * performance failure. Every action names the pick by id from a form, so
 * the pick is matched to this owner before anything is written.
 */

/** The signed-in owner's ready pick named by the form, or a redirect away. */
async function ownedPick(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const pickId = formData.get("pickId");
  if (!isPickId(pickId)) redirect("/app/picks");
  const detail = viewableDetail(await repo.getPickDetail(pickId), business.id);
  if (!detail) redirect("/app/picks");
  return { user, repo, business, detail };
}

function revalidatePick(pickId: string) {
  revalidatePath("/app/picks");
  revalidatePath(`/app/picks/${pickId}`);
  revalidatePath("/app/campaigns");
  revalidatePath("/app/record");
}

/** "Choose for production": the decision is logged and a planned run opens. Nothing is live. */
export async function choosePickAction(formData: FormData): Promise<void> {
  const { user, repo, business, detail } = await ownedPick(formData);
  const pickId = detail.pick.id;
  if (!detail.dismissed && !detail.run) {
    await repo.createPickFeedback({ pick_id: pickId, business_id: business.id, user_id: user.id, action: "chosen", reason: null, note: null });
    await repo.createPickRun({ pick_id: pickId, business_id: business.id, status: "planned" });
  }
  revalidatePick(pickId);
  redirect(`/app/picks/${pickId}`);
}

/** "Mark launched": a planned run goes live; a pick nobody chose first is chosen and launched in one step. */
export async function launchPickAction(formData: FormData): Promise<void> {
  const { user, repo, business, detail } = await ownedPick(formData);
  const pickId = detail.pick.id;
  const now = new Date().toISOString();
  if (!detail.dismissed) {
    if (detail.run?.status === "planned") {
      await repo.updatePickRun(detail.run.id, { status: "running", launched_at: now });
      await repo.createPickFeedback({ pick_id: pickId, business_id: business.id, user_id: user.id, action: "running", reason: null, note: null });
    } else if (!detail.run) {
      await repo.createPickFeedback({ pick_id: pickId, business_id: business.id, user_id: user.id, action: "running", reason: null, note: null });
      await repo.createPickRun({ pick_id: pickId, business_id: business.id, status: "running", launched_at: now });
    }
  }
  revalidatePick(pickId);
  redirect(`/app/picks/${pickId}`);
}

/** "We're running this" on an older keyword pick: chosen and launched at once, then Campaigns. */
export async function runPickAction(formData: FormData): Promise<void> {
  const { user, repo, business, detail } = await ownedPick(formData);
  const pickId = detail.pick.id;
  if (!detail.dismissed && detail.run?.status !== "running") {
    await repo.createPickFeedback({ pick_id: pickId, business_id: business.id, user_id: user.id, action: "running", reason: null, note: null });
    await repo.createPickRun({ pick_id: pickId, business_id: business.id, status: "running", launched_at: new Date().toISOString() });
  }
  revalidatePick(pickId);
  redirect("/app/campaigns");
}

/** "Pass": one of the reasons plus an optional note, then back to the list. */
export async function dismissPickAction(formData: FormData): Promise<void> {
  const { user, repo, business, detail } = await ownedPick(formData);
  const pickId = detail.pick.id;
  const reason = parseDismissReason(formData.get("reason"));
  if (!reason) redirect(`/app/picks/${pickId}`);
  if (!detail.dismissed) {
    await repo.createPickFeedback({
      pick_id: pickId,
      business_id: business.id,
      user_id: user.id,
      action: "dismissed",
      reason,
      note: cleanNote(formData.get("note")),
    });
  }
  revalidatePick(pickId);
  redirect("/app/picks");
}
