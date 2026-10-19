"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { normalOf } from "@/lib/creators/stats";
import { scanCreator } from "@/lib/creators/scan";
import { getCreator } from "@/lib/data";
import { adminSupabase } from "@/lib/db/supabase";
import { MAX_PEERS, type Goal, type Goals, type Plan, type Video } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";
import { isScanning } from "@/lib/format";
import { GOALS } from "@/lib/goals";
import { disconnect } from "@/lib/tiktok/connect";
import { normHandle, normTag } from "@/lib/tiktok/read";

export interface FormState {
  error?: string;
  notice?: string;
  saved?: boolean;
}

/** A TikTok handle: letters, numbers, underscores and periods, up to 24. */
const HANDLE = /^[a-z0-9_.]{2,24}$/;
/** A manual scan can start this long after the last one. */
const SCAN_MIN_GAP_MS = 10 * 60_000;

async function requireCreator() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  return { user, creator };
}

/** Setup: the handle to read. Creates the creator (or points it at a new handle) and starts the first scan. */
export async function startAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const handle = normHandle(String(formData.get("handle") ?? ""));
  if (!HANDLE.test(handle)) return { error: "Enter your TikTok handle, like @yourname." };
  const sb = adminSupabase();
  const existing = await getCreator(user.id);
  let id = existing?.id;
  if (existing && existing.handle !== handle) {
    // A new handle is a new account: what was read for the old one no longer applies.
    await Promise.all(["peers", "videos", "follower_snapshots", "trend_snapshots", "plans", "idea_runs", "tiktok_connections"].map((t) => sb.from(t).delete().eq("creator_id", existing.id)));
    await sb
      .from("creators")
      .update({ handle, profile: null, hashtags: [], display_name: null, avatar_url: null, bio: null, followers: null, last_scan_at: null, scan_status: "idle", scan_stage: null, scan_error: null, tiktok_connected_at: null })
      .eq("id", existing.id);
  } else if (!existing) {
    const { data, error } = await sb.from("creators").insert({ owner_id: user.id, handle }).select("id").single();
    if (error) return { error: "Couldn't save that handle. Try again in a moment." };
    id = data.id as string;
  }
  after(() => scanCreator(id!).catch((e) => console.warn("[setup] scan:", (e as Error).message)));
  redirect("/app/setup");
}

export async function saveGoalsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const goal = String(formData.get("goal") ?? "") as Goal;
  if (!GOALS.some((g) => g.value === goal)) return { error: "Pick a goal." };
  const clip = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 200);
  const goals: Goals = { goal, posts_per_week: clip("posts_per_week"), target: clip("target"), notes: clip("notes") };
  await adminSupabase().from("creators").update({ goals }).eq("id", creator.id);
  revalidatePath("/app", "layout");
  const next = String(formData.get("next") ?? "");
  if (next === "/app") redirect("/app");
  return { saved: true };
}

export async function scanNowAction(): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  if (planState(creator).locked) redirect("/app/settings#billing");
  if (isScanning(creator)) redirect("/app");
  if (creator.last_scan_at && Date.now() - Date.parse(creator.last_scan_at) < SCAN_MIN_GAP_MS) redirect("/app?scan=recent");
  await adminSupabase().from("creators").update({ scan_status: "running", scan_stage: "profile", scan_started_at: new Date().toISOString(), scan_error: null, plan_requested: true }).eq("id", creator.id);
  after(() => scanCreator(creator.id, { resume: true }).catch((e) => console.warn("[scan-now]:", (e as Error).message)));
  redirect("/app");
}

/** "Add to my week": the idea is tracked, with the creator's typical range as the bar it is measured against. */
export async function addToWeekAction(formData: FormData): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const planId = String(formData.get("plan") ?? "");
  const rank = Number(formData.get("rank"));
  const sb = adminSupabase();
  const { data: plan } = await sb.from("plans").select("*").eq("id", planId).eq("creator_id", creator.id).maybeSingle<Plan>();
  const idea = plan?.body.ideas[rank - 1];
  if (!plan || !idea) redirect("/app");
  const { data: dup } = await sb.from("idea_runs").select("id").eq("plan_id", planId).eq("rank", rank).maybeSingle();
  if (!dup) {
    const { data: own } = await sb.from("videos").select("views, saves, comments, posted_at").eq("creator_id", creator.id).eq("is_self", true).order("posted_at", { ascending: false }).limit(30);
    const n = normalOf((own ?? []) as Pick<Video, "views" | "saves" | "comments" | "posted_at">[]);
    await sb.from("idea_runs").insert({
      creator_id: creator.id,
      plan_id: planId,
      rank,
      idea,
      expected: n.low !== null && n.high !== null ? { low: n.low, high: n.high } : null,
    });
  }
  revalidatePath("/app");
  redirect(`/app?added=${rank}#idea-${rank}`);
}

export async function removeRunAction(formData: FormData): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  await adminSupabase().from("idea_runs").delete().eq("id", String(formData.get("id") ?? "")).eq("creator_id", creator.id);
  revalidatePath("/app");
}

export async function addPeerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const handle = normHandle(String(formData.get("handle") ?? ""));
  if (!HANDLE.test(handle)) return { error: "Enter a TikTok handle, like @theircreator." };
  if (handle === creator.handle) return { error: "That's you." };
  const sb = adminSupabase();
  const { count } = await sb.from("peers").select("id", { count: "exact", head: true }).eq("creator_id", creator.id);
  if ((count ?? 0) >= MAX_PEERS) return { error: `You can follow up to ${MAX_PEERS} creators. Remove one first.` };
  const { error } = await sb.from("peers").insert({ creator_id: creator.id, handle, source: "owner", reason: "Added by you" });
  if (error) return { error: /duplicate/i.test(error.message) ? "Already on your list." : "Couldn't add that creator." };
  revalidatePath("/app", "layout");
  return { notice: `@${handle} is read on the next scan.` };
}

export async function removePeerAction(formData: FormData): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const sb = adminSupabase();
  const { data } = await sb.from("peers").select("handle").eq("id", String(formData.get("id") ?? "")).eq("creator_id", creator.id).maybeSingle();
  if (data) {
    await sb.from("peers").delete().eq("id", String(formData.get("id"))).eq("creator_id", creator.id);
    // Their videos go too, so they stop counting toward trends and ideas.
    await sb.from("videos").delete().eq("creator_id", creator.id).eq("author", data.handle);
  }
  revalidatePath("/app", "layout");
}

export async function saveHashtagsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const tags = [...new Set(String(formData.get("hashtags") ?? "").split(/[\s,]+/).map(normTag).filter((t) => /^[\p{L}\p{N}_]{2,40}$/u.test(t)))].slice(0, 8);
  if (!tags.length) return { error: "Add at least one hashtag." };
  await adminSupabase().from("creators").update({ hashtags: tags }).eq("id", creator.id);
  revalidatePath("/app", "layout");
  return { saved: true };
}

export async function disconnectTiktokAction(): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  await disconnect(creator.id);
  revalidatePath("/app/settings");
}

export async function checkoutAction(): Promise<void> {
  const { user, creator } = await requireCreator();
  if (!creator || !isStripeConfigured) redirect("/app/settings");
  const { createCheckoutSession } = await import("@/lib/billing/stripe");
  redirect(await createCheckoutSession(creator, user.email));
}

export async function billingPortalAction(): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator?.stripe_customer_id) redirect("/app/settings");
  const { createPortalSession } = await import("@/lib/billing/stripe");
  redirect(await createPortalSession(creator.stripe_customer_id));
}
