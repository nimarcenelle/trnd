import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Meta Marketing API — connect (OAuth) and read (the account's own ad
 * history). TRND never launches an ad: the brief is handed to a creator and
 * the ad runs in the brand's own Ads Manager, and the results come back by
 * the ad's name (lib/ads/run-sync.ts). Network is plain fetch against the
 * Graph API. Everything is gated on META_APP_ID/SECRET.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

const AD_SCOPES = ["ads_read", "ads_management", "business_management"];

/**
 * Reading Reels per hashtag needs `instagram_basic` + `pages_show_list` and
 * an Instagram Business account linked to a Facebook Page — and Meta will
 * not grant either without App Review. Requesting a scope the app has not
 * been approved for degrades the consent screen for the ad-account connect
 * that already works, so these are added only once META_INSTAGRAM_SCOPES is
 * set, which should happen the day review passes and not before.
 */
const INSTAGRAM_SCOPES = ["instagram_basic", "pages_show_list"];

export const META_SCOPES = env.metaInstagramScopes
  ? [...AD_SCOPES, ...INSTAGRAM_SCOPES]
  : AD_SCOPES;

/* ------------------------------- OAuth state ------------------------------ */

/** businessId, HMAC-signed with the app secret so the callback can trust it. */
export function signOauthState(businessId: string): string {
  const sig = createHmac("sha256", env.metaAppSecret).update(businessId).digest("hex");
  return `${businessId}.${sig}`;
}

export function verifyOauthState(state: string | null): string | null {
  if (!state) return null;
  const idx = state.lastIndexOf(".");
  if (idx <= 0) return null;
  const businessId = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = createHmac("sha256", env.metaAppSecret).update(businessId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return businessId;
}

export function metaRedirectUri(): string {
  return `${env.appUrl}/api/connect/meta/callback`;
}

export function metaOauthUrl(businessId: string): string {
  const params = new URLSearchParams({
    client_id: env.metaAppId,
    redirect_uri: metaRedirectUri(),
    state: signOauthState(businessId),
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

/* --------------------------------- tokens -------------------------------- */

interface GraphError {
  message?: string;
  error_user_msg?: string;
}
const graphErrorText = (e: GraphError | undefined, fallback: number) =>
  e?.error_user_msg ?? e?.message ?? String(fallback);

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`);
  const data = (await res.json()) as T & { error?: GraphError };
  if (!res.ok || data.error) {
    throw new Error(`meta graph ${path}: ${graphErrorText(data.error, res.status)}`);
  }
  return data;
}

/** code → short-lived token → long-lived (~60 day) token. */
export async function exchangeCodeForToken(code: string): Promise<{ token: string; expiresAt: string | null }> {
  const short = await graphGet<{ access_token: string }>("/oauth/access_token", {
    client_id: env.metaAppId,
    client_secret: env.metaAppSecret,
    redirect_uri: metaRedirectUri(),
    code,
  });
  const long = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: env.metaAppId,
    client_secret: env.metaAppSecret,
    fb_exchange_token: short.access_token,
  });
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
  };
}

export async function listAdAccounts(
  token: string,
): Promise<{ id: string; name: string }[]> {
  const data = await graphGet<{ data?: { id: string; name: string; account_status: number }[] }>(
    "/me/adaccounts",
    { fields: "id,name,account_status", access_token: token },
  );
  return (data.data ?? []).filter((a) => a.account_status === 1).map(({ id, name }) => ({ id, name }));
}

/* ------------------------------ account history --------------------------- */

/** One ad's row from the account insights edge, as Graph returns it: every
 * number is a string, and a field the ad never reported is simply absent. */
export interface MetaAdInsight {
  ad_id: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  spend?: string;
  /** A percentage (1.25 means 1.25%), computed on all clicks. */
  ctr?: string;
  actions?: { action_type: string; value: string }[];
  date_start?: string;
  date_stop?: string;
}

/** The words an ad actually showed, recovered from its creative. */
export interface MetaAdCopy {
  title: string | null;
  body: string | null;
  /** yyyy-mm-dd the ad was created, the closest thing Graph has to a start. */
  createdOn: string | null;
}

const AD_INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "adset_name",
  "campaign_name",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "spend",
  "ctr",
  "actions",
  "date_start",
  "date_stop",
].join(",");

/** 20 pages of 500 is 10,000 ads, far past what the history read ranks. A
 * cap keeps a runaway cursor from eating the cron's whole time budget. */
export const MAX_INSIGHT_PAGES = 20;
const INSIGHT_PAGE_SIZE = 500;
/** Graph refuses an ?ids= lookup with more than 50 ids. */
const IDS_PER_REQUEST = 50;

/** paging.next is a complete URL with the token already in it. */
async function graphGetUrl<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: GraphError };
  if (!res.ok || data.error) {
    throw new Error(`meta graph ${label}: ${graphErrorText(data.error, res.status)}`);
  }
  return data;
}

/** Every ad in the account with delivery in the window, one row per ad over
 * the whole window. Graph leaves out ads that never served, so a paused test
 * ad from last spring costs nothing. */
export async function fetchAdLevelInsights(
  token: string,
  adAccountId: string,
  window: { since: string; until: string },
  opts: { maxPages?: number } = {},
): Promise<MetaAdInsight[]> {
  const path = `/${adAccountId}/insights`;
  const params = new URLSearchParams({
    level: "ad",
    fields: AD_INSIGHT_FIELDS,
    time_range: JSON.stringify(window),
    limit: String(INSIGHT_PAGE_SIZE),
    access_token: token,
  });
  const out: MetaAdInsight[] = [];
  let url: string | undefined = `${GRAPH}${path}?${params}`;
  for (let page = 0; url && page < (opts.maxPages ?? MAX_INSIGHT_PAGES); page++) {
    const data: { data?: MetaAdInsight[]; paging?: { next?: string } } = await graphGetUrl(url, path);
    out.push(...(data.data ?? []));
    url = data.paging?.next;
  }
  return out;
}

interface GraphCreative {
  body?: string;
  title?: string;
  object_story_spec?: {
    link_data?: { message?: string; name?: string };
    video_data?: { message?: string; title?: string };
    template_data?: { message?: string; name?: string };
  };
  asset_feed_spec?: { bodies?: { text?: string }[]; titles?: { text?: string }[] };
}

const firstText = (...values: (string | undefined)[]) =>
  values.map((v) => v?.trim()).find((v): v is string => Boolean(v)) ?? null;

/** Where the words live depends on how the ad was built: a simple creative
 * fills body and title, a Page post ad keeps them in object_story_spec, and
 * a dynamic creative keeps a list in asset_feed_spec. The first of each list
 * is the variant the advertiser wrote first, the nearest to "the" copy. */
export function creativeCopy(creative: GraphCreative | undefined): { title: string | null; body: string | null } {
  const story = creative?.object_story_spec;
  const feed = creative?.asset_feed_spec;
  return {
    title: firstText(
      creative?.title,
      story?.link_data?.name,
      story?.video_data?.title,
      story?.template_data?.name,
      ...(feed?.titles ?? []).map((t) => t.text),
    ),
    body: firstText(
      creative?.body,
      story?.link_data?.message,
      story?.video_data?.message,
      story?.template_data?.message,
      ...(feed?.bodies ?? []).map((b) => b.text),
    ),
  };
}

/** Copy for many ads, 50 ids per request. Insights never carries creative
 * text, and the theme read is only as good as the words it classifies. */
export async function fetchAdCreativeCopy(token: string, adIds: string[]): Promise<Record<string, MetaAdCopy>> {
  const out: Record<string, MetaAdCopy> = {};
  const ids = [...new Set(adIds)];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const data = await graphGet<Record<string, { created_time?: string; creative?: GraphCreative }>>("/", {
      ids: ids.slice(i, i + IDS_PER_REQUEST).join(","),
      fields: "created_time,creative{body,title,object_story_spec,asset_feed_spec}",
      access_token: token,
    });
    for (const [id, ad] of Object.entries(data)) {
      if (!ad || typeof ad !== "object") continue;
      out[id] = { ...creativeCopy(ad.creative), createdOn: ad.created_time?.slice(0, 10) ?? null };
    }
  }
  return out;
}

