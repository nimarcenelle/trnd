import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getCreator } from "@/lib/data";
import { isTiktokLoginConfigured } from "@/lib/env";
import { authorizeUrl } from "@/lib/tiktok/connect";

/** Sends the creator to TikTok's consent screen, with a state cookie the callback checks. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  if (!isTiktokLoginConfigured) redirect("/app/settings?tiktok=unavailable#tiktok");
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("tt_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/tiktok", maxAge: 600 });
  redirect(authorizeUrl(state));
}
