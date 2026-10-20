"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { normalOf } from "@/lib/creators/stats";
import { createCreator } from "@/lib/creators/create";
import { canRetry, switchBlocked } from "@/lib/creators/guards";
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
  const id = existing?.id;
  if (existing && existing.handle !== handle) {
    if (isScanning(existing)) return { error: "We're still reading your current account. Change the handle once that finishes, in about two minutes." };
    if (switchBlocked(existing)) return { error: "You can switch accounts again tomorrow. Start your free trial to switch now." };
    // A new handle is a new account: what was read for the old one no longer applies.
    if (existing.tiktok_connected_at) await disconnect(existing.id);
    const results = await Promise.all(["peers", "videos", "follower_snapshots", "trend_snapshots", "plans", "idea_runs"].map((t) => sb.from(t).delete().eq("creator_id", existing.id)));
    if (results.some((r) => r.error)) return { error: "Couldn't switch accounts. Try again in a moment." };
    await sb
      .from("creators")
      .update({
        handle,
        profile: null,
        profile_read_at: null,
        hashtags: [],
        display_name: null,
        avatar_url: null,
        bio: null,
        followers: null,
        following: null,
        hearts: null,
        videos: null,
        last_scan_at: null,
        plan_requested: false,
        scan_status: "idle",
        scan_stage: null,
        scan_error: null,
      })
      .eq("id", existing.id);
  } else if (existing && !canRetry(existing)) {
    // The same handle again: a read already running or finished isn't started over (that's "Read again now", with its own limits).
    redirect(isScanning(existing) ? "/app/setup" : "/app");
  } else if (!existing) {
    const made = await createCreator(user.id, handle).catch(() => null);
    if (!made) return { error: "Couldn't save that handle. Try again in a moment." };
    redirect(made.claimed ? "/app/welcome" : "/app/setup");
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

/** Setup's "Try again": picks a stopped first read up where it stopped. */
export async function retryScanAction(): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  if (canRetry(creator)) {
    after(() => scanCreator(creator.id, { resume: true }).catch((e) => console.warn("[setup] retry:", (e as Error).message)));
    await adminSupabase().from("creators").update({ scan_status: "running", scan_stage: creator.scan_stage ?? "profile", scan_started_at: new Date().toISOString(), scan_error: null }).eq("id", creator.id);
  }
  redirect("/app/setup");
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
  const { data: own } = await sb.from("videos").select("views, saves, comments, posted_at").eq("creator_id", creator.id).eq("is_self", true).order("posted_at", { ascending: false }).limit(30);
  const n = normalOf((own ?? []) as Pick<Video, "views" | "saves" | "comments" | "posted_at">[]);
  // One run per idea (unique plan_id, rank): a second click is a no-op.
  await sb
    .from("idea_runs")
    .upsert({ creator_id: creator.id, plan_id: planId, rank, idea, expected: n.low !== null && n.high !== null ? { low: n.low, high: n.high } : null }, { onConflict: "plan_id,rank", ignoreDuplicates: true });
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
  const { data: rows } = await sb.from("peers").select("id, handle, removed_at").eq("creator_id", creator.id);
  const list = rows ?? [];
  const existing = list.find((p) => p.handle === handle);
  if (existing && !existing.removed_at) return { error: "Already on your list." };
  if (list.filter((p) => !p.removed_at).length >= MAX_PEERS) return { error: `You can follow up to ${MAX_PEERS} creators. Remove one first.` };
  // Someone removed earlier comes back as yours.
  const { error } = existing
    ? await sb.from("peers").update({ removed_at: null, source: "owner", reason: "Added by you" }).eq("id", existing.id)
    : await sb.from("peers").insert({ creator_id: creator.id, handle, source: "owner", reason: "Added by you" });
  if (error) return { error: "Couldn't add that creator." };
  revalidatePath("/app", "layout");
  return { notice: `@${handle} is read on the next scan.` };
}

export async function removePeerAction(formData: FormData): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const sb = adminSupabase();
  const { data } = await sb.from("peers").select("handle").eq("id", String(formData.get("id") ?? "")).eq("creator_id", creator.id).maybeSingle();
  if (data) {
    // Kept, marked removed, so the next scan does not match them again.
    await sb.from("peers").update({ removed_at: new Date().toISOString() }).eq("id", String(formData.get("id"))).eq("creator_id", creator.id);
    // Their videos go, so they stop counting toward trends and ideas.
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

export async function checkoutAction(formData: FormData): Promise<void> {
  const { user, creator } = await requireCreator();
  if (!creator || !isStripeConfigured) redirect("/app/settings");
  const interval = formData.get("interval") === "weekly" ? "weekly" : "monthly";
  const { createCheckoutSession } = await import("@/lib/billing/stripe");
  redirect(await createCheckoutSession(creator, user.email, interval));
}

export async function billingPortalAction(): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator?.stripe_customer_id) redirect("/app/settings");
  const { createPortalSession } = await import("@/lib/billing/stripe");
  redirect(await createPortalSession(creator.stripe_customer_id));
}

/** One tap in the welcome steps: the goal, how often they post, or how they film. Then the next step. */
export async function welcomeAnswerAction(formData: FormData): Promise<void> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");
  const goals: Goals = creator.goals ?? { goal: "followers", posts_per_week: "", target: "", notes: "" };
  const sb = adminSupabase();
  if (field === "goal" && GOALS.some((g) => g.value === value)) await sb.from("creators").update({ goals: { ...goals, goal: value as Goal } }).eq("id", creator.id);
  if (field === "cadence" && ["1-2", "3-4", "5+"].includes(value)) await sb.from("creators").update({ goals: { ...goals, posts_per_week: value } }).eq("id", creator.id);
  if (field === "camera" && ["face", "voice", "either"].includes(value)) await sb.from("creators").update({ on_camera: value }).eq("id", creator.id);
  revalidatePath("/app", "layout");
  redirect(`/app/welcome?step=${encodeURIComponent(String(formData.get("next") ?? ""))}`);
}

/**
 * Welcome: the creators they want to be like, up to three handles. Theirs come
 * first, so when the list is full the newest matched creators make room.
 */
export async function welcomeModelsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { creator } = await requireCreator();
  if (!creator) redirect("/app/setup");
  const raw = formData.getAll("handles").map((v) => normHandle(String(v))).filter(Boolean);
  const bad = raw.find((h) => !HANDLE.test(h));
  if (bad) return { error: `"${bad}" isn't a TikTok handle. Use their @name, like @theircreator.` };
  const handles = [...new Set(raw)].filter((h) => h !== creator.handle).slice(0, 3);
  const next = String(formData.get("next") ?? "done");
  if (handles.length) {
    const sb = adminSupabase();
    const { data: rows } = await sb.from("peers").select("id, handle, source, removed_at, created_at").eq("creator_id", creator.id);
    const list = rows ?? [];
    const live = list.filter((p) => !p.removed_at);
    const fresh = handles.filter((h) => !live.some((p) => p.handle === h && p.source === "owner"));
    const room = MAX_PEERS - live.filter((p) => !fresh.includes(p.handle)).length;
    const make = fresh.length - room;
    if (make > 0) {
      const drop = live
        .filter((p) => p.source !== "owner" && !fresh.includes(p.handle))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, make)
        .map((p) => p.id);
      if (drop.length) await sb.from("peers").update({ removed_at: new Date().toISOString() }).in("id", drop);
    }
    for (const handle of fresh) {
      const existing = list.find((p) => p.handle === handle);
      const { error } = existing
        ? await sb.from("peers").update({ removed_at: null, source: "owner", reason: "Added by you" }).eq("id", existing.id)
        : await sb.from("peers").insert({ creator_id: creator.id, handle, source: "owner", reason: "Added by you" });
      if (error) return { error: `Couldn't add @${handle}. Try again.` };
    }
    revalidatePath("/app", "layout");
  }
  redirect(next === "trial" ? "/app/welcome?step=trial" : "/app");
}
