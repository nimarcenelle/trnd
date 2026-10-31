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
  /** Two Stripe recurring prices: $9.99 a week and $24.99 a month. */
  stripePriceWeekly: process.env.STRIPE_PRICE_WEEKLY ?? "",
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM || "TRND <plans@usetrnd.com>",
  /** Where the daily cron sends a note when reads are failing or stuck. */
  alertEmail: process.env.ALERT_EMAIL || "hello@usetrnd.com",
};

export const isModelConfigured = Boolean(env.openaiApiKey);
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePriceWeekly && env.stripePriceMonthly);
export const isEmailConfigured = Boolean(env.resendApiKey);
export const isTiktokLoginConfigured = Boolean(env.tiktokClientKey && env.tiktokClientSecret);
