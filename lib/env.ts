/**
 * Every environment variable the app reads, in one place. Defaulted reads use
 * `||` so an empty string (what Vercel's env import creates) means unset.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** OPENAI_MODEL_PRO is the old name, still read so a live deploy keeps its pin. */
  openaiModel: process.env.OPENAI_MODEL || process.env.OPENAI_MODEL_PRO || "gpt-5.5",
  /** Social reads (Instagram, TikTok, Facebook posts) cost Apify credit per run: on with the token, APIFY_SOCIAL=0 turns them off. */
  apifySocial: Boolean(process.env.APIFY_TOKEN) && process.env.APIFY_SOCIAL !== "0",
  /** Optional fallback for the Ad Library read when Meta walls our fetch. */
  apifyToken: process.env.APIFY_TOKEN ?? "",
  apifyAdLibraryActor: process.env.APIFY_ADLIBRARY_ACTOR || "curious_coder~facebook-ads-library-scraper",
  /** Model tokens a brand may use per 24 hours before analysis waits for the next scan. */
  aiDailyTokens: Math.max(50_000, Number(process.env.AI_DAILY_TOKENS) || 1_500_000),
  /** Scans run as jobs on the worker (lib/jobs.ts, worker/scans.ts) instead of in Vercel functions. */
  scanQueue: process.env.SCAN_QUEUE === "1" || process.env.SCAN_QUEUE === "true",
  /** Where data-health alerts go (lib/ops.ts). */
  opsEmail: process.env.OPS_EMAIL ?? "",
  /** TRND's scraper worker (worker/server.ts): a real browser behind a residential proxy. */
  scraperUrl: (process.env.SCRAPER_URL ?? "").replace(/\/$/, ""),
  scraperKey: process.env.SCRAPER_KEY ?? "",
  /** Meta's official Ad Library API: a user access token from developers.facebook.com/tools/ad-library. */
  metaAccessToken: process.env.META_ACCESS_TOKEN ?? "",
  metaApiVersion: process.env.META_API_VERSION || "v23.0",
  /** Cost controls for the paid Apify reads: ads per company per paid read, and days between paid reads. */
  apifyAdsPerRival: Math.min(200, Math.max(5, Number(process.env.APIFY_ADS_PER_RIVAL) || 25)),
  apifyEveryDays: Math.max(1, Number(process.env.APIFY_EVERY_DAYS) || 2),
  /** Days between Instagram/TikTok reads, and between Facebook post reads (all through Apify). */
  socialEveryDays: Math.max(1, Number(process.env.SOCIAL_EVERY_DAYS) || 2),
  facebookPostsEveryDays: Math.max(1, Number(process.env.FACEBOOK_POSTS_EVERY_DAYS) || 7),
  /** Ads read per rival per scan. 100 covers most Pages whole; Jolie alone runs 62. */
  adsPerRival: Math.min(200, Math.max(10, Number(process.env.ADS_PER_RIVAL) || 100)),
  cronSecret: process.env.CRON_SECRET ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePrice: process.env.STRIPE_PRICE ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM || "TRND <reports@usetrnd.com>",
  /** The domain competitors' marketing emails are received on, e.g. "in.usetrnd.com". */
  inboundDomain: (process.env.INBOUND_DOMAIN ?? "").trim().toLowerCase(),
  /** Resend's webhook signing secret (whsec_…), or a shared secret any other service sends as ?secret= or x-trnd-secret. */
  inboundSecret: process.env.INBOUND_SECRET ?? "",
};

export const isModelConfigured = Boolean(env.openaiApiKey);
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePrice);
export const isEmailConfigured = Boolean(env.resendApiKey);
export const isInboxConfigured = Boolean(env.inboundDomain && env.inboundSecret);
export const isWorkerConfigured = Boolean(env.scraperUrl && env.scraperKey);
