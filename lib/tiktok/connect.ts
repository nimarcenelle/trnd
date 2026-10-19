import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import { env, isTiktokLoginConfigured } from "@/lib/env";

import type { ReadAuthor, ReadVideo } from "./read";

/**
 * TikTok Login Kit: a creator connects their own account, and its numbers come
 * straight from TikTok instead of a public read. The scopes granted here
 * (user.info.basic, user.info.profile, user.info.stats, video.list) give the
 * same counts the public profile shows, minus saves, but verified and without
 * scraping. Watch time, retention and followers per video need TikTok's
 * separate Business API (see DATA.md). Production use needs TikTok's app
 * review; until then only the app's sandbox test users can connect.
 */

export const SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list";
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";

export const redirectUri = () => `${env.siteUrl}/api/tiktok/callback`;

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({ client_key: env.tiktokClientKey, scope: SCOPES, response_type: "code", redirect_uri: redirectUri(), state });
  return `${AUTH_URL}?${q}`;
}

interface TokenReply {
  open_id: string;
  scope: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
}

async function token(params: Record<string, string>): Promise<TokenReply> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ client_key: env.tiktokClientKey, client_secret: env.tiktokClientSecret, ...params }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Partial<TokenReply> & { error?: string; error_description?: string };
  if (!res.ok || body.error || !body.access_token) throw new Error(`TikTok token: ${body.error_description || body.error || res.status}`);
  return body as TokenReply;
}

const expiry = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** Trades the code from the consent screen for tokens and saves them; returns the account's username. */
export async function completeConnect(creatorId: string, code: string): Promise<string> {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  // Without the username we can't tell whose account this is, so nothing is saved.
  const user = await getJson(`${API}/user/info/?fields=open_id,username,display_name`, t.access_token);
  const username = (user.data as { user?: { username?: string } } | undefined)?.user?.username;
  if (!username) throw new Error("TikTok did not say which account this is");
  const sb = adminSupabase();
  await sb.from("tiktok_connections").upsert({
    creator_id: creatorId,
    open_id: t.open_id,
    username,
    scopes: t.scope,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: expiry(t.expires_in),
    refresh_expires_at: expiry(t.refresh_expires_in),
    connected_at: new Date().toISOString(),
  });
  await sb.from("creators").update({ tiktok_connected_at: new Date().toISOString() }).eq("id", creatorId);
  return username;
}

export async function disconnect(creatorId: string): Promise<void> {
  const sb = adminSupabase();
  const { data } = await sb.from("tiktok_connections").select("access_token").eq("creator_id", creatorId).maybeSingle();
  if (data?.access_token && isTiktokLoginConfigured) {
    await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: env.tiktokClientKey, client_secret: env.tiktokClientSecret, token: data.access_token }),
    }).catch(() => undefined);
  }
  await sb.from("tiktok_connections").delete().eq("creator_id", creatorId);
  await sb.from("creators").update({ tiktok_connected_at: null }).eq("id", creatorId);
}

type Json = Record<string, unknown>;
async function getJson(url: string, accessToken: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as Json;
  const err = body.error as { code?: string; message?: string } | undefined;
  if (!res.ok || (err && err.code && err.code !== "ok")) throw new Error(`TikTok API: ${err?.message || err?.code || res.status}`);
  return body;
}

/** A live access token for the creator, refreshed when it is about to expire; null when not connected. */
async function accessToken(creatorId: string): Promise<string | null> {
  const sb = adminSupabase();
  const { data } = await sb.from("tiktok_connections").select("*").eq("creator_id", creatorId).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) - Date.now() > 5 * 60_000) return data.access_token as string;
  if (Date.parse(data.refresh_expires_at) < Date.now()) {
    await disconnect(creatorId);
    return null;
  }
  const t = await token({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await sb
    .from("tiktok_connections")
    .update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiry(t.expires_in), refresh_expires_at: expiry(t.refresh_expires_in) })
    .eq("creator_id", creatorId);
  return t.access_token;
}

/** The connected account's numbers and its recent videos' counts, keyed by video id, or null when not connected. */
export async function readConnected(creatorId: string): Promise<{ author: Partial<ReadAuthor>; videos: Map<string, Partial<ReadVideo>> } | null> {
  if (!isTiktokLoginConfigured) return null;
  const at = await accessToken(creatorId);
  if (!at) return null;
  const info = await getJson(`${API}/user/info/?fields=username,display_name,avatar_url,bio_description,follower_count,following_count,likes_count,video_count`, at);
  const u = ((info.data as Json | undefined)?.user ?? {}) as Json;
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const list = await getJson(`${API}/video/list/?fields=id,create_time,duration,view_count,like_count,comment_count,share_count`, at, {
    method: "POST",
    body: JSON.stringify({ max_count: 20 }),
  });
  const videos = new Map<string, Partial<ReadVideo>>();
  for (const v of (((list.data as Json | undefined)?.videos ?? []) as Json[])) {
    if (typeof v.id !== "string") continue;
    videos.set(v.id, { views: n(v.view_count), likes: n(v.like_count), comments: n(v.comment_count), shares: n(v.share_count) });
  }
  return {
    author: { followers: n(u.follower_count), following: n(u.following_count), hearts: n(u.likes_count), videos: n(u.video_count) },
    videos,
  };
}
