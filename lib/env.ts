/**
 * Central env access. `isSupabaseConfigured` / `isModelConfigured` are the
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
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Pin the two model tiers (lib/ai/openai.ts); unset, the newest general
   * and the newest small model on the account are resolved at first use. */
  openaiModelPro: process.env.OPENAI_MODEL_PRO ?? "",
  openaiModelFlash: process.env.OPENAI_MODEL_FLASH ?? "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  redditUserAgent: process.env.REDDIT_USER_AGENT || "trnd-signal/0.1 (by /u/trnd)",
  /** Reddit's official API (free, 100 requests a minute) — a script app's
   * client id and secret. The public JSON endpoints answer 403 from cloud
   * IPs, so without these the adapter reads nothing in production. */
  redditClientId: process.env.REDDIT_CLIENT_ID ?? "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET ?? "",
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
  /** Optional: raises the reader proxy's rate limit (lib/import/reader.ts). */
  jinaApiKey: process.env.JINA_API_KEY ?? "",
  apifyTiktokActor: process.env.APIFY_TIKTOK_ACTOR ?? "",
  /** Apify actors for the social and rival-ad reads. Each has a documented
   * default in its adapter; these exist because actors get renamed. */
  apifyInstagramActor: process.env.APIFY_INSTAGRAM_ACTOR ?? "",
  apifyFacebookActor: process.env.APIFY_FACEBOOK_ACTOR ?? "",
  apifyAdLibraryActor: process.env.APIFY_ADLIBRARY_ACTOR ?? "",
  apifyGoogleAdsActor: process.env.APIFY_GOOGLE_ADS_ACTOR ?? "",
  /** X recent search — the written half of the conversation read. No
   * keyless path exists; read access is a paid tier. */
  xBearerToken: process.env.X_BEARER_TOKEN ?? "",
  /** Instagram Graph, as OUR OWN professional account. Reads any public
   * professional account's posts free through Business Discovery
   * (lib/social/instagram.ts) with no App Review: the reader is an account
   * with a role on the app. A token from Instagram Login ("IG…") or
   * Facebook Login ("EAA…") both work; the id is the professional account's. */
  instagramToken: process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
  instagramUserId: process.env.INSTAGRAM_BUSINESS_ID ?? "",
  /** DataForSEO — the sturdy search-volume backbone for watch terms. */
  dataForSeoLogin: process.env.DATAFORSEO_LOGIN ?? "",
  dataForSeoPassword: process.env.DATAFORSEO_PASSWORD ?? "",
  /** Comma-separated emails allowed into /admin — the internal growth tools. */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** When set, self-serve signup needs this code: the pilot's front door is
   * the application, and a paid scan runs only for a brand the founder let in. */
  pilotInviteCode: process.env.PILOT_INVITE_CODE ?? "",
  /** Prospector outreach sender — falls back to the report sender. */
  outreachFrom: process.env.OUTREACH_FROM || process.env.EMAIL_FROM || "TRND <reports@usetrnd.com>",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isModelConfigured = Boolean(env.openaiApiKey);
/** Billing switches on with a secret key + at least the baseline price id. */
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePriceBaseline);
export const isMetaAdsConfigured = Boolean(env.metaAppId && env.metaAppSecret);
export const isGoogleAdsConfigured = Boolean(
  env.googleAdsClientId && env.googleAdsClientSecret && env.googleAdsDeveloperToken,
);
export const isPlacesConfigured = Boolean(env.placesApiKey);
/** Per-term TikTok; the national board adapter runs regardless. */
export const isApifyConfigured = Boolean(env.apifyToken);
/** The Shorts read; free, and the single highest-value key in the file. */
export const isYoutubeConfigured = Boolean(env.youtubeApiKey);
export const isXConfigured = Boolean(env.xBearerToken);
/** Instagram reads need both halves: a token and the professional account it reads as. */
export const isInstagramConfigured = Boolean(env.instagramToken && env.instagramUserId);
export const isEmailConfigured = Boolean(env.resendApiKey);
export const isDataForSeoConfigured = Boolean(env.dataForSeoLogin && env.dataForSeoPassword);
export const isRedditConfigured = Boolean(env.redditClientId && env.redditClientSecret);
/** Signup asks for an invite code; the landing page sends everyone else to the application. */
export const isPilotGated = Boolean(env.pilotInviteCode);

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
