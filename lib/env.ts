/**
 * Every environment variable the app reads, in one place. Defaulted reads use
 * `||` so an empty string (what Vercel's env import creates) means unset.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.5",
  /** Public TikTok reads (profiles, hashtags) go through Apify. */
  apifyToken: process.env.APIFY_TOKEN ?? "",
  /** TikTok Login Kit, for a creator to connect their account (developers.tiktok.com). Optional. */
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePrice: process.env.STRIPE_PRICE ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM || "TRND <plans@usetrnd.com>",
};

export const isModelConfigured = Boolean(env.openaiApiKey);
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePrice);
export const isEmailConfigured = Boolean(env.resendApiKey);
export const isTiktokLoginConfigured = Boolean(env.tiktokClientKey && env.tiktokClientSecret);
