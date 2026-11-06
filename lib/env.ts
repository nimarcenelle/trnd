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
  /** The Creator plan: $19 a month or $149 a year (lib/billing). */
  stripePriceCreatorMonthly: process.env.STRIPE_PRICE_CREATOR_MONTHLY ?? "",
  stripePriceCreatorYearly: process.env.STRIPE_PRICE_CREATOR_YEARLY ?? "",
  /** One-time add-ons: the script pack ($19) and the done-for-you month ($79). Optional; unset, they take an email instead. */
  stripePriceScriptPack: process.env.STRIPE_PRICE_SCRIPT_PACK ?? "",
  stripePriceDoneForYou: process.env.STRIPE_PRICE_DONE_FOR_YOU ?? "",
  /** The old $9.99/week and $24.99/month prices: no longer sold, read only to label existing subscriptions. */
  stripePriceWeekly: process.env.STRIPE_PRICE_WEEKLY ?? "",
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY ?? "",
  /** A Stripe coupon (100% off, once) for a referrer who already pays. Unset, their free month is a credit for their next checkout. */
  stripeCouponFreeMonth: process.env.STRIPE_COUPON_FREE_MONTH ?? "",
  /** Signed-in emails that may open /admin (the funnel numbers), comma separated. */
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM || "TRND <plans@usetrnd.com>",
  /** Where the daily cron sends a note when reads are failing or stuck. */
  alertEmail: process.env.ALERT_EMAIL || "hello@usetrnd.com",
};

export const isModelConfigured = Boolean(env.openaiApiKey);
export const isStripeConfigured = Boolean(env.stripeSecretKey && env.stripePriceCreatorMonthly && env.stripePriceCreatorYearly);
export const isEmailConfigured = Boolean(env.resendApiKey);
export const isTiktokLoginConfigured = Boolean(env.tiktokClientKey && env.tiktokClientSecret);
