import { sealedStoreWorks } from "@/lib/admitted/saved";
import { env, isEmailConfigured, isEssayOpen, isModelConfigured, isStripeConfigured } from "@/lib/env";

/** Which integrations are configured, and whether essay results can be saved encrypted. Never values. */
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
      essays: { open: isEssayOpen, sealedStore: isEssayOpen ? await sealedStoreWorks() : false },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
