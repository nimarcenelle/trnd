import {
  env,
  isApifyConfigured,
  isDataForSeoConfigured,
  isEmailConfigured,
  isGeminiConfigured,
  isMetaAdsConfigured,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";

/**
 * Ops probe for uptime monitors and deploy checks. No auth, no secrets —
 * only which integration mode each subsystem is running in, and whether
 * the keys a paying customer's week depends on are present.
 */
export async function GET(): Promise<Response> {
  let database: "supabase" | "demo-store" | "error" = isSupabaseConfigured ? "supabase" : "demo-store";
  if (!isSupabaseConfigured) {
    try {
      const { loadStore } = await import("@/lib/db/demo/store");
      loadStore();
    } catch {
      database = "error";
    }
  }
  // One trivial query, timed: the function-to-database round trip is the
  // unit every page pays several times over, so it belongs on the probe.
  let dbRttMs: number | null = null;
  if (isSupabaseConfigured) {
    try {
      const { createAdminSupabase } = await import("@/lib/db/supabase/admin-client");
      const started = Date.now();
      await createAdminSupabase().from("businesses").select("id").limit(1);
      dbRttMs = Date.now() - started;
    } catch {
      dbRttMs = null;
    }
  }
  const body = {
    ok: database !== "error",
    dbRttMs,
    time: new Date().toISOString(),
    mode: {
      database,
      generation: isGeminiConfigured ? "gemini" : "template",
      billing: isStripeConfigured ? (env.stripeSecretKey.startsWith("sk_live_") ? "stripe-live" : "stripe-test") : "off",
    },
    /** Presence only, never values: what a customer's week and receipt need. */
    keys: {
      stripePriceBaseline: Boolean(env.stripePriceBaseline),
      stripeWebhook: Boolean(env.stripeWebhookSecret),
      email: isEmailConfigured,
      apify: isApifyConfigured,
      dataForSeo: isDataForSeoConfigured,
      metaAds: isMetaAdsConfigured,
      cron: Boolean(env.cronSecret),
    },
  };
  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
