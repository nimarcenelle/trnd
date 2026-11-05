import { paidSession } from "@/lib/admitted/access";
import { EssayCapReached, reviewEssay } from "@/lib/admitted/review";
import { parseWordLimit, wordCount } from "@/lib/admitted/review-core";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  if (!(await paidSession())) return Response.json({ error: "payment_required" }, { status: 402 });
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
