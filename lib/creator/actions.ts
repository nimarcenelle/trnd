"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { normHandle } from "@/lib/social/read";

import { requireAdmin } from "./admin";
import { cleanSrc, isHandle, runCheck, type CreatorCheck, type CreatorPlatform } from "./check";
import { logEvent, saveCheck, saveLead, saveTeardown, setPosted } from "./store";
import { writeTeardown } from "./teardown";

/**
 * The free check is public and every run spends Apify and OpenAI credit, so
 * each address gets a few an hour and a handle read in the last hour is
 * served again. Both live in the instance's memory: a best-effort brake, not
 * a guarantee across instances.
 */
const PER_HOUR = 4;
const HOUR = 3_600_000;
const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; result: CreatorCheck }>();

function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= PER_HOUR) return false;
  hits.set(ip, [...recent, now]);
  if (hits.size > 5000) hits.clear();
  return true;
}

const platformOf = (v: FormDataEntryValue | null): CreatorPlatform => (v === "instagram" ? "instagram" : "tiktok");

export async function checkCreatorAction(_prev: CreatorCheck, formData: FormData): Promise<CreatorCheck> {
  const handle = normHandle(String(formData.get("handle") ?? ""));
  const platform = platformOf(formData.get("platform"));
  const niche = String(formData.get("niche") ?? "").trim().slice(0, 80);
  const src = cleanSrc(formData.get("src"));
  if (!isHandle(handle)) return { error: "Enter your handle, like @yourname.", src };
  if (!env.apifyToken) return { error: "The profile check is switched off on this server right now. Try again later.", src };

  const key = `${platform}:${handle}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < HOUR && (!niche || cached.result.niche === niche)) {
    await logEvent("check", { handle, platform, src, meta: { cached: true } });
    return { ...cached.result, src };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip)) return { error: "That's a few checks in an hour from here. Try again in a little while.", src };

  const started = Date.now();
  const result = await runCheck(handle, platform, niche);
  const ms = Date.now() - started;
  if (result.error) {
    await logEvent("check_failed", { handle, platform, src, meta: { error: result.error, ms } });
    return { ...result, src };
  }
  result.id = await saveCheck({ ...result, src });
  await logEvent("check", { handle, platform, src, meta: { ms, id: result.id, posts: result.stats?.posts.length, breakouts: result.stats?.breakouts, read: Boolean(result.read) } });
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 2000) cache.clear();
  return { ...result, src };
}

export interface LeadState {
  error?: string;
  saved?: boolean;
}

/** "Re-check my posts next week": the email, against the handle just checked. */
export async function saveLeadAction(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const handle = normHandle(String(formData.get("handle") ?? ""));
  const platform = platformOf(formData.get("platform"));
  const src = cleanSrc(formData.get("src"));
  const wantsPlan = formData.get("plan") === "1";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { error: "Enter an email address, like you@example.com." };
  if (!isHandle(handle)) return { error: "Run the check first, then ask for the weekly one." };
  try {
    await saveLead({ email, handle, platform, niche: String(formData.get("niche") ?? "").trim().slice(0, 80), src, wantsPlan });
  } catch (e) {
    console.warn("[creator] lead not saved:", (e as Error).message);
    return { error: "We couldn't save that just now. Try again in a minute." };
  }
  await logEvent(wantsPlan ? "waitlist" : "lead", { handle, platform, src });
  return { saved: true };
}

/** A result shared: how, for the funnel. Fire and forget from the share bar. */
export async function logShareAction(id: string, how: "link" | "image" | "native"): Promise<void> {
  if (!/^[a-z0-9]{6,16}$/.test(id) || !["link", "image", "native"].includes(how)) return;
  await logEvent("share", { meta: { id, how } });
}

/* ------------------------------- the studio ------------------------------ */

export interface TeardownState {
  error?: string;
}

/** A video code: the handle and the day, so two teardowns of one creator count apart. */
const teardownSrc = (handle: string) => `td-${handle.replace(/[^a-z0-9]/g, "").slice(0, 20)}-${new Date().toISOString().slice(5, 10).replace("-", "")}`;

export async function teardownAction(_prev: TeardownState, formData: FormData): Promise<TeardownState> {
  await requireAdmin();
  const handle = normHandle(String(formData.get("handle") ?? ""));
  const platform = platformOf(formData.get("platform"));
  const niche = String(formData.get("niche") ?? "").trim().slice(0, 80);
  if (!isHandle(handle)) return { error: "Enter a public creator's handle, like @name." };
  if (!env.apifyToken) return { error: "APIFY_TOKEN is not set, so profiles can't be read." };

  const check = await runCheck(handle, platform, niche);
  if (check.error || !check.stats) return { error: check.error ?? "The check said nothing for this account." };
  const src = teardownSrc(handle);
  let id: string;
  try {
    const script = await writeTeardown({ handle, platform, niche, stats: check.stats, read: check.read ?? null, link: `${env.siteUrl.replace(/^https?:\/\//, "")}/creators?src=${src}` });
    id = await saveTeardown({ handle, platform, niche: niche || null, src, stats: check.stats, script });
  } catch (e) {
    console.warn("[studio] teardown failed:", (e as Error).message);
    return { error: `The script for @${handle} didn't finish: ${(e as Error).message.slice(0, 160)}` };
  }
  await logEvent("teardown", { handle, platform, src });
  revalidatePath("/studio");
  redirect(`/studio/teardowns/${id}`);
}

export async function markPostedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await setPosted(id, formData.get("posted") === "1");
  revalidatePath("/studio");
  revalidatePath(`/studio/teardowns/${id}`);
}
