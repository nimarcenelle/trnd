import { env, isEmailConfigured, isModelConfigured, isStripeConfigured } from "@/lib/env";

/** Which integrations are configured. Presence only, never values. */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      keys: {
        supabase: Boolean(env.supabaseUrl && env.supabaseServiceRoleKey),
        openai: isModelConfigured,
        apifyFallback: Boolean(env.apifyToken),
        stripe: isStripeConfigured,
        email: isEmailConfigured,
        cron: Boolean(env.cronSecret),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
