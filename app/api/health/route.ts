import { isGeminiConfigured, isStripeConfigured, isSupabaseConfigured } from "@/lib/env";

/**
 * Ops probe for uptime monitors and deploy checks. No auth, no secrets —
 * only which integration mode each subsystem is running in.
 */
export async function GET(): Promise<Response> {
  let database: "supabase" | "demo-store" | "error" = isSupabaseConfigured ? "supabase" : "demo-store";
  if (!isSupabaseConfigured) {
    try {
      const { loadStore } = await import("@/lib/db/demo/store");
      loadStore();
    } catch {
      database = "error";
    }
  }
  const body = {
    ok: database !== "error",
    time: new Date().toISOString(),
    mode: {
      database,
      generation: isGeminiConfigured ? "gemini" : "template",
      billing: isStripeConfigured ? "stripe" : "off",
    },
  };
  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
