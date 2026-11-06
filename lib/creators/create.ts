import "server-only";

import { cookies } from "next/headers";
import { after } from "next/server";

import { adminSupabase } from "@/lib/db/supabase";
import type { Goal } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { claimPreview, getPreview } from "@/lib/preview/run";
import { PREVIEW_COOKIE } from "@/lib/preview/types";
import { isCode, REF_COOKIE } from "@/lib/referrals";

import { scanCreator } from "./scan";

/**
 * A new account's creator. When the visitor's free preview is for this handle
 * and ready, it is claimed: the app opens on that plan at once. Otherwise the
 * first read starts after the response.
 */
export async function createCreator(userId: string, handle: string): Promise<{ id: string; claimed: boolean }> {
  const sb = adminSupabase();
  const { data: existing } = await sb.from("creators").select("id").eq("owner_id", userId).maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await sb.from("creators").insert({ owner_id: userId, handle }).select("id").single();
    if (error) {
      // Two tabs at once: the other one created it.
      const { data: again } = await sb.from("creators").select("id").eq("owner_id", userId).maybeSingle();
      if (!again) throw new Error(error.message);
      return { id: again.id as string, claimed: false };
    }
    id = data.id as string;
    // Signed up through someone's link: remember whose, for both free months.
    const code = (await cookies()).get(REF_COOKIE)?.value;
    const { data: referrer } = code && isCode(code) ? await sb.from("creators").select("id").eq("referral_code", code).neq("id", id).maybeSingle<{ id: string }>() : { data: null };
    if (referrer) {
      await sb.from("creators").update({ referred_by: referrer.id }).eq("id", id);
      await logEvent("referral_signup", { creatorId: id, meta: { referrer: referrer.id } });
    }
    await logEvent("account_created", { creatorId: id, meta: { handle, referred: Boolean(referrer) } });
  }
  const previewId = (await cookies()).get(PREVIEW_COOKIE)?.value;
  const preview = previewId ? await getPreview(previewId) : null;
  if (preview?.handle === handle && (await claimPreview(preview.id, { id, handle }))) {
    if (preview.goal) await sb.from("creators").update({ goals: { goal: preview.goal as Goal, posts_per_week: "", target: "", notes: "" } }).eq("id", id);
    return { id, claimed: true };
  }
  const creatorId = id;
  after(() => scanCreator(creatorId).catch((e) => console.warn("[create] scan:", (e as Error).message)));
  return { id, claimed: false };
}
