import { paidSession } from "@/lib/admitted/access";
import { parseWordLimit, wordCount } from "@/lib/admitted/review-core";
import { EssayCapReached, rewriteEssay } from "@/lib/admitted/rewrite";
import { parseAnswers } from "@/lib/admitted/rewrite-core";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  if (!(await paidSession())) return Response.json({ error: "payment_required" }, { status: 402 });
  const body = (await request.json().catch(() => null)) as { draft?: unknown; prompt?: unknown; limit?: unknown; revision?: unknown; answers?: unknown } | null;
  const draft = String(body?.draft ?? "").trim();
  const words = wordCount(draft);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });
  const revision = Math.min(500, Math.max(0, Math.floor(Number(body?.revision) || 0)));
  try {
    return Response.json(await rewriteEssay(draft, String(body?.prompt ?? "").trim().slice(0, 500), parseWordLimit(body?.limit), revision, parseAnswers(body?.answers)));
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[rewrite]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
