/**
 * Central env access. `isSupabaseConfigured` / `isGeminiConfigured` are the
 * switches that flip the app between real integrations and the loudly-labeled
 * local fallbacks documented in BLOCKED.md.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  redditUserAgent: process.env.REDDIT_USER_AGENT || "trnd-signal/0.1 (by /u/trnd)",
  cronSecret: process.env.CRON_SECRET ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceBaseline: process.env.STRIPE_PRICE_BASELINE ?? "",
  stripePricePro: process.env.STRIPE_PRICE_PRO ?? "",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isGeminiConfigured = Boolean(env.geminiApiKey);
/** Billing switches on with a secret key + at least the baseline price id. */
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePriceBaseline);

let warned = false;
/** One loud console note per process, so demo mode is never silent. */
export function warnDemoModeOnce() {
  if (warned || isSupabaseConfigured) return;
  warned = true;
  console.warn(
    "[trnd] Supabase env vars are not set — running in DEMO MODE against the local " +
      "seeded store (.demo-data/). See BLOCKED.md for the seam to make it real.",
  );
}
