import { isMetaApiConfigured } from "@/lib/adlibrary/api";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { env, isEmailConfigured, isInboxConfigured, isModelConfigured, isStripeConfigured } from "@/lib/env";

/**
 * Which integrations are configured (presence only, never values). With
 * `?probe=<brand name>&key=<CRON_SECRET>` it also runs one Ad Library search
 * from this server, through the free readers only, and says which one worked:
 * the quickest way to see whether Meta walls the deployment.
 */
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const probe = url.searchParams.get("probe");
  let read: Record<string, unknown> | undefined;
  if (probe) {
    if (!env.cronSecret || url.searchParams.get("key") !== env.cronSecret) return new Response("unauthorized", { status: 401 });
    const started = Date.now();
    try {
      const { ads, via, complete } = await scrapeAds({ query: probe.slice(0, 80) }, 30, { backup: false });
      read = { ok: true, via, ads: ads.length, complete, pages: [...new Set(ads.map((a) => a.pageName).filter(Boolean))].slice(0, 8), ms: Date.now() - started };
    } catch (err) {
      read = { ok: false, error: (err as Error).message, ms: Date.now() - started };
    }
  }
  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      keys: {
        supabase: Boolean(env.supabaseUrl && env.supabaseServiceRoleKey),
        openai: isModelConfigured,
        metaApi: isMetaApiConfigured(),
        apifyFallback: Boolean(env.apifyToken),
        stripe: isStripeConfigured,
        email: isEmailConfigured,
        inbox: isInboxConfigured,
        cron: Boolean(env.cronSecret),
      },
      ...(read ? { read } : {}),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
