"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { cleanNote, isPickId, parseDismissReason, viewableDetail } from "@/lib/picks/detail";

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
}

/** "We're running this": log the decision, open a run, land on Campaigns. */
export async function runPickAction(formData: FormData): Promise<void> {
  const { user, repo, business, detail } = await ownedPick(formData);
  const pickId = detail.pick.id;
  // A second tap (or a dismissed pick) doesn't open a second run.
  if (!detail.dismissed && detail.run?.status !== "running") {
    await repo.createPickFeedback({
      pick_id: pickId,
      business_id: business.id,
      user_id: user.id,
      action: "running",
      reason: null,
      note: null,
    });
    await repo.createPickRun({ pick_id: pickId, business_id: business.id, status: "running" });
  }
  revalidatePick(pickId);
  redirect("/app/campaigns");
}

/** "Not for us": one of five reasons plus an optional note, then back to the list. */
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
