import { createHmac, timingSafeEqual } from "node:crypto";

import type { Business, Campaign } from "@/lib/db/types";
import { env } from "@/lib/env";

/**
 * Meta Marketing API — connect (OAuth), read (insights), act (launch as
 * PAUSED so the owner always pulls the final trigger in Ads Manager).
 * Request shapes are pure builders (unit-tested); network is plain fetch
 * against the Graph API. Everything is gated on META_APP_ID/SECRET.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export const META_SCOPES = ["ads_read", "ads_management", "business_management"];

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

/* -------------------------------- insights ------------------------------- */

export interface MetaInsightsRow {
  impressions: number | null;
  clicks: number | null;
  spend_cents: number | null;
  bookings: number | null;
  revenue_cents: number | null;
}

/** Pure parser over a Graph insights row — unit-tested. */
export function parseInsights(row: {
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}): MetaInsightsRow {
  const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
  const conversions = (row.actions ?? [])
    .filter((a) => /purchase|lead|schedule|complete_registration|onsite_conversion/.test(a.action_type))
    .reduce((s, a) => s + Number(a.value || 0), 0);
  const revenue = (row.action_values ?? [])
    .filter((a) => /purchase/.test(a.action_type))
    .reduce((s, a) => s + Number(a.value || 0), 0);
  return {
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    spend_cents: row.spend !== undefined ? Math.round(Number(row.spend) * 100) : null,
    bookings: conversions > 0 ? conversions : null,
    revenue_cents: revenue > 0 ? Math.round(revenue * 100) : null,
  };
}

/** Lifetime-to-date insights for one platform campaign. */
export async function fetchCampaignInsights(
  token: string,
  externalCampaignId: string,
): Promise<{ row: MetaInsightsRow; status: string } | null> {
  const [insights, campaign] = await Promise.all([
    graphGet<{ data?: Record<string, never>[] }>(`/${externalCampaignId}/insights`, {
      fields: "impressions,clicks,spend,actions,action_values",
      date_preset: "maximum",
      access_token: token,
    }),
    graphGet<{ effective_status?: string }>(`/${externalCampaignId}`, {
      fields: "effective_status",
      access_token: token,
    }),
  ]);
  const first = insights.data?.[0];
  if (!first) return null;
  return { row: parseInsights(first), status: campaign.effective_status ?? "UNKNOWN" };
}

/* --------------------------------- launch -------------------------------- */

/** Pure payload builders — the shapes the Graph API receives, unit-tested. */
export function buildCampaignPayload(campaign: Campaign): Record<string, string> {
  return {
    name: `TRND · ${campaign.hook.slice(0, 60)}`,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: "[]",
    // Budget lives on the ad set; the API requires this stated explicitly.
    is_adset_budget_sharing_enabled: "false",
  };
}

export function buildAdSetPayload(
  business: Business,
  campaign: Campaign,
  externalCampaignId: string,
  dailyBudgetCents: number,
): Record<string, string> {
  const radius = Math.min(50, Math.max(1, campaign.audience.radius_miles || business.radius_miles));
  const targeting =
    business.lat !== null && business.lng !== null
      ? {
          geo_locations: {
            custom_locations: [
              { latitude: business.lat, longitude: business.lng, radius, distance_unit: "mile" },
            ],
          },
        }
      : { geo_locations: { countries: ["US"] } };
  return {
    name: `TRND · ${campaign.audience.who.slice(0, 60)}`,
    campaign_id: externalCampaignId,
    daily_budget: String(dailyBudgetCents),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    targeting: JSON.stringify(targeting),
  };
}

async function graphPost<T>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: token }),
  });
  const data = (await res.json()) as T & { error?: GraphError };
  if (!res.ok || data.error) {
    throw new Error(`meta graph POST ${path}: ${graphErrorText(data.error, res.status)}`);
  }
  return data;
}

/**
 * Create the campaign + ad set in the connected account, both PAUSED. The
 * creative (needs a Facebook Page selection) stays a copy-paste step in Ads
 * Manager; TRND owns structure, budget, and targeting so nothing spends
 * until the owner flips it on.
 */
export async function launchPausedCampaign(
  token: string,
  adAccountId: string,
  business: Business,
  campaign: Campaign,
  dailyBudgetCents: number,
): Promise<{ externalId: string }> {
  const created = await graphPost<{ id: string }>(
    `/${adAccountId}/campaigns`,
    token,
    buildCampaignPayload(campaign),
  );
  await graphPost<{ id: string }>(
    `/${adAccountId}/adsets`,
    token,
    buildAdSetPayload(business, campaign, created.id, dailyBudgetCents),
  );
  return { externalId: created.id };
}
