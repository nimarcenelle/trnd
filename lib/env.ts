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
  redditUserAgent: process.env.REDDIT_USER_AGENT ?? "trnd-signal/0.1 (by /u/trnd)",
  cronSecret: process.env.CRON_SECRET ?? "",
  /** Public origin for OAuth redirects and email links, e.g. https://usetrnd.com */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Meta Marketing API app — ad-account connect, results sync, launch. */
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  /** Google Ads OAuth + developer token — seam; sync ships Meta-first. */
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
  /** Google Places — own + competitor ratings and review text. */
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  /** Resend — weekly report email + alert digests. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "TRND <reports@usetrnd.com>",
  /** DataForSEO — the sturdy search-volume backbone for watch terms. */
  dataForSeoLogin: process.env.DATAFORSEO_LOGIN ?? "",
  dataForSeoPassword: process.env.DATAFORSEO_PASSWORD ?? "",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isGeminiConfigured = Boolean(env.geminiApiKey);
export const isMetaAdsConfigured = Boolean(env.metaAppId && env.metaAppSecret);
export const isGoogleAdsConfigured = Boolean(
  env.googleAdsClientId && env.googleAdsClientSecret && env.googleAdsDeveloperToken,
);
export const isPlacesConfigured = Boolean(env.placesApiKey);
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
