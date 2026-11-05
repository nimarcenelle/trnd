import { parseWordLimit, wordCount } from "@/lib/admitted/review-core";
import { EssayCapReached, rewriteEssay } from "@/lib/admitted/rewrite";
import { env, isModelConfigured } from "@/lib/env";

export const maxDuration = 300;

/** Off until ESSAY_REWRITES_ENABLED=1: rewrites use the costliest model and have no paywall yet. */
export async function POST(request: Request): Promise<Response> {
  if (!env.essayRewritesEnabled || !isModelConfigured || !env.supabaseServiceRoleKey) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { draft?: unknown; prompt?: unknown; limit?: unknown; revision?: unknown } | null;
  const draft = String(body?.draft ?? "").trim();
  const words = wordCount(draft);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });
  const revision = Math.min(20, Math.max(0, Math.floor(Number(body?.revision) || 0)));
  try {
    return Response.json(await rewriteEssay(draft, String(body?.prompt ?? "").trim().slice(0, 500), parseWordLimit(body?.limit), revision));
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[rewrite]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
