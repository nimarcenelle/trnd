import { getSessionUser } from "@/lib/auth/session";
import { getCreator, listPlans } from "@/lib/data";
import { logEvent } from "@/lib/events";
import { planCard } from "@/lib/preview/plan-card";
import { referralCode, referralUrl } from "@/lib/referrals";

/** The week's plan as a shareable image, with the creator's referral link on it. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const creator = await getCreator(user.id);
  const [latest] = creator ? await listPlans(creator.id, 1) : [];
  if (!creator || !latest) return new Response("No plan yet", { status: 404 });
  const link = referralUrl(await referralCode(creator));
  await logEvent("share_card", { creatorId: creator.id, meta: { plan: latest.id, from: "plan" } });
  const img = planCard({ handle: creator.handle, hooks: latest.body.ideas.map((i) => i.hook), link });
  const headers = new Headers(img.headers);
  headers.set("content-disposition", `attachment; filename="trnd-next-3-posts-${creator.handle}.png"`);
  return new Response(img.body, { headers });
}
