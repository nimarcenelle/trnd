import { DAILY_LIMITS, paidSession, subscriberId } from "@/lib/admitted/access";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/admitted/saved";
import { EssayCapReached, reviewEssay } from "@/lib/admitted/review";
import { parseWordLimit, wordCount } from "@/lib/admitted/review-core";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const session = await paidSession();
  if (!session) return Response.json({ error: "payment_required" }, { status: 402 });
  const subscriber = subscriberId(session);
  if ((await subscriberUsedToday("use_review", subscriber).catch(() => 0)) >= DAILY_LIMITS.review) return Response.json({ error: "subscriber_limit" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { essay?: unknown; prompt?: unknown; limit?: unknown } | null;
  const essay = String(body?.essay ?? "").trim();
  const words = wordCount(essay);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });
  try {
    const result = await reviewEssay(essay, String(body?.prompt ?? "").trim().slice(0, 500), parseWordLimit(body?.limit));
    await recordSubscriberUse("use_review", subscriber);
    return Response.json(result);
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[review]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
