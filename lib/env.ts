/**
 * Central env access. `isSupabaseConfigured` / `isGeminiConfigured` are the
 * switches that flip the app between real integrations and the loudly-labeled
 * local fallbacks documented in BLOCKED.md.
 *
 * Defaulted reads use `||`, never `??` — env imports (e.g. Vercel's
 * .env.example scan) create variables as empty strings, and empty must mean
 * unset or a blank value poisons URLs and senders downstream.
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
  /** Public origin for OAuth redirects and email links — falls back to siteUrl. */
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceBaseline: process.env.STRIPE_PRICE_BASELINE ?? "",
  stripePricePro: process.env.STRIPE_PRICE_PRO ?? "",
  /** Meta Marketing API app — ad-account connect, results sync, launch. */
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  /** Flip to "1" only AFTER Meta App Review approves instagram_basic —
   * requesting an unapproved scope degrades the live ad-connect consent
   * screen, so the Reels read stays dark until the approval exists. */
  metaInstagramScopes: process.env.META_INSTAGRAM_SCOPES === "1",
  /** Google Ads OAuth + developer token — seam; sync ships Meta-first. */
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
  /** Google Places — own + competitor ratings and review text. */
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  /** Resend — weekly report email + alert digests. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM || "TRND <reports@usetrnd.com>",
  /** Apify — the paid per-term TikTok read. Without it TikTok degrades to
   * the keyless national Creative Center board. */
  apifyToken: process.env.APIFY_TOKEN ?? "",
  apifyTiktokActor: process.env.APIFY_TIKTOK_ACTOR ?? "",
  /** DataForSEO — the sturdy search-volume backbone for watch terms. */
  dataForSeoLogin: process.env.DATAFORSEO_LOGIN ?? "",
  dataForSeoPassword: process.env.DATAFORSEO_PASSWORD ?? "",
  /** Comma-separated emails allowed into /admin — the internal growth tools. */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** Prospector outreach sender — falls back to the report sender. */
  outreachFrom: process.env.OUTREACH_FROM || process.env.EMAIL_FROM || "TRND <reports@usetrnd.com>",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isGeminiConfigured = Boolean(env.geminiApiKey);
/** Billing switches on with a secret key + at least the baseline price id. */
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePriceBaseline);
export const isMetaAdsConfigured = Boolean(env.metaAppId && env.metaAppSecret);
export const isGoogleAdsConfigured = Boolean(
  env.googleAdsClientId && env.googleAdsClientSecret && env.googleAdsDeveloperToken,
);
export const isPlacesConfigured = Boolean(env.placesApiKey);
/** Per-term TikTok; the national board adapter runs regardless. */
export const isApifyConfigured = Boolean(env.apifyToken);
export const isEmailConfigured = Boolean(env.resendApiKey);
export const isDataForSeoConfigured = Boolean(env.dataForSeoLogin && env.dataForSeoPassword);

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
