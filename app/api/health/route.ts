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
  // The paid reader's meter. Apify stops every run at its plan's monthly
  // cap, and the readers treat a refused run as "nothing to show", so a
  // spent cap is a silent outage: the Starter plan's $25 was reached on
  // day two of a cycle with two signups a day. Presence and share only.
  let apifyUsage: { usd: number; capUsd: number; share: number } | null = null;
  if (isApifyConfigured) {
    try {
      const res = await fetch(`https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(env.apifyToken)}`, {
        signal: AbortSignal.timeout(4_000),
        cache: "no-store",
      });
      const data = (await res.json()) as { data?: { limits?: { maxMonthlyUsageUsd?: number }; current?: { monthlyUsageUsd?: number } } };
      const usd = data.data?.current?.monthlyUsageUsd;
      const capUsd = data.data?.limits?.maxMonthlyUsageUsd;
      if (typeof usd === "number" && typeof capUsd === "number" && capUsd > 0) {
        apifyUsage = { usd: Math.round(usd * 100) / 100, capUsd, share: Math.round((usd / capUsd) * 100) / 100 };
      }
    } catch {
      apifyUsage = null;
    }
  }
  const warnings: string[] = [];
  if (apifyUsage && apifyUsage.share >= 0.9) {
    warnings.push(`Apify at $${apifyUsage.usd} of its $${apifyUsage.capUsd} monthly cap: social, TikTok and rival-ad reads stop at the cap.`);
  }
  const body = {
    ok: database !== "error",
    dbRttMs,
    time: new Date().toISOString(),
    warnings,
    apifyUsage,
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
