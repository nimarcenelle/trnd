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
  /** Optional fallback for the Ad Library read when Meta walls our fetch. */
  apifyToken: process.env.APIFY_TOKEN ?? "",
  apifyAdLibraryActor: process.env.APIFY_ADLIBRARY_ACTOR || "curious_coder~facebook-ads-library-scraper",
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
