"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Goal } from "@/lib/db/types";
import { GOALS } from "@/lib/goals";
import { normHandle } from "@/lib/tiktok/read";

import { clientIp } from "./limits";
import { confirmPreview, setPreviewGoal, startPreview } from "./run";
import { PREVIEW_COOKIE } from "./types";

const HANDLE = /^[a-z0-9_.]{2,24}$/;

async function humanCheck(token: string | null, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { success?: boolean } | null;
  return Boolean(body?.success);
}

export interface StartState {
  error?: string;
}

/** The home page's handle box: starts (or reuses) a free preview and opens it. */
export async function startPreviewAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const handle = normHandle(String(formData.get("handle") ?? ""));
  if (!HANDLE.test(handle)) return { error: "Enter your TikTok handle, like @yourname." };
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  if (!(await humanCheck(formData.get("cf-turnstile-response") as string | null, ip))) return { error: "Please confirm you're not a robot, then try again." };
  const res = await startPreview(handle, ip);
  // Out of free previews (for this visitor, or for today): the account flow reads it instead.
  if ("blocked" in res) redirect(`/signup?handle=${encodeURIComponent(handle)}&from=preview`);
  (await cookies()).set(PREVIEW_COOKIE, res.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
  redirect(`/start/${res.id}`);
}

const asGoal = (v: FormDataEntryValue | null): Goal | null => (GOALS.some((g) => g.value === v) ? (v as Goal) : null);

/** "That's me": the rest of the preview runs. */
export async function confirmPreviewAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await confirmPreview(id, asGoal(formData.get("goal")));
  redirect(`/start/${id}`);
}

/** The one tap asked while the preview is written. */
export async function previewGoalAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const goal = asGoal(formData.get("goal"));
  if (goal) await setPreviewGoal(id, goal);
  redirect(`/start/${id}`);
}
