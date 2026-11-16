import { DAILY_LIMITS, networkId, paidSession, subscriberId } from "@/lib/essayodds/access";
import { isDemoEssay } from "@/lib/essayodds/demo";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { parseWordLimit, wordCount } from "@/lib/essayodds/review-core";
import { EssayCapReached, rewriteEssay } from "@/lib/essayodds/rewrite";
import { parseAnswers } from "@/lib/essayodds/rewrite-core";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const session = await paidSession();
  if (!session) return Response.json({ error: "payment_required" }, { status: 402 });
  const subscriber = session === "demo" ? networkId(request) : subscriberId(session);
  if ((await subscriberUsedToday("use_rewrite", subscriber).catch(() => 0)) >= DAILY_LIMITS.rewrite) return Response.json({ error: "subscriber_limit" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { draft?: unknown; prompt?: unknown; limit?: unknown; revision?: unknown; answers?: unknown } | null;
  const draft = String(body?.draft ?? "").trim();
  const words = wordCount(draft);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });
  if (session === "demo" && !isDemoEssay(draft)) return Response.json({ error: "demo_only" }, { status: 402 });
  const revision = Math.min(500, Math.max(0, Math.floor(Number(body?.revision) || 0)));
  try {
    const result = await rewriteEssay(draft, String(body?.prompt ?? "").trim().slice(0, 500), parseWordLimit(body?.limit), revision, parseAnswers(body?.answers));
    await recordSubscriberUse("use_rewrite", subscriber);
    return Response.json(result);
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[rewrite]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
