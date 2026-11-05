import { EssayCapReached, reviewEssay } from "@/lib/admitted/review";
import { parseWordLimit, wordCount } from "@/lib/admitted/review-core";
import { env, isModelConfigured } from "@/lib/env";

export const maxDuration = 180;

/** Off until ESSAY_REWRITES_ENABLED=1: reviews use the costliest model and have no paywall yet. */
export async function POST(request: Request): Promise<Response> {
  if (!env.essayRewritesEnabled || !isModelConfigured || !env.supabaseServiceRoleKey) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { essay?: unknown; prompt?: unknown; limit?: unknown } | null;
  const essay = String(body?.essay ?? "").trim();
  const words = wordCount(essay);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });
  try {
    return Response.json(await reviewEssay(essay, String(body?.prompt ?? "").trim().slice(0, 500), parseWordLimit(body?.limit)));
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[review]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
