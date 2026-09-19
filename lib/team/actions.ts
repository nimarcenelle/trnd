"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getPlanState, planLimits } from "@/lib/billing";
import { getUserRepo } from "@/lib/db";
import { sendTeamInvite } from "@/lib/email/team-invite";

/**
 * The roster. Only the owner invites and removes; a member sees the brand
 * the way the owner does but never edits the business row or the team.
 * An invitation is an email; the account comes when they sign up with it.
 */

export interface TeamState {
  error?: string;
  ok?: string;
}


async function ownerBusiness() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  return { user, repo, business };
}

export async function inviteMemberAction(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const { user, repo, business } = await ownerBusiness();
  if (!business) return { error: "Only the brand's owner can invite people." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  if (email === user.email.toLowerCase()) return { error: "That is your own email." };
  const [members, plan] = await Promise.all([repo.listMembers(business.id).catch(() => []), getPlanState(repo, business)]);
  const seats = planLimits(plan.plan).seats;
  if (members.length >= seats) return { error: `Your plan has ${seats} ${seats === 1 ? "seat" : "seats"} besides you. Move up a plan for more.` };
  try {
    await repo.inviteMember({ business_id: business.id, email, invited_by: user.id });
  } catch (err) {
    console.warn("[team] invite failed:", (err as Error).message);
    return { error: "The invitation could not be saved. If the team migration has not been run yet, that is why." };
  }
  const sent = await sendTeamInvite({ brand: business.name, inviter: user.fullName ?? user.email, email });
  revalidatePath("/app/settings");
  return { ok: sent.skipped ? `${email} is on the roster. Email is not configured here, so tell them to sign up with that address.` : `Invited ${email}.` };
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { repo, business } = await ownerBusiness();
  if (!business) return;
  const id = String(formData.get("member_id") ?? "").trim();
  if (!id) return;
  const mine = (await repo.listMembers(business.id).catch(() => [])).find((m) => m.id === id);
  if (!mine) return;
  await repo.removeMember(id);
  revalidatePath("/app/settings");
}
