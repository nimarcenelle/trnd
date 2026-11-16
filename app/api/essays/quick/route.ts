import { networkId } from "@/lib/admitted/access";
import { EssayCapReached, quickRead } from "@/lib/admitted/review";
import { wordCount } from "@/lib/admitted/review-core";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/admitted/saved";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 60;

/** The odds flow's quick read, so the odds can count the essay. No plan needed, capped per network a day. Returns only the score. */
const PER_DAY = 10;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { essay?: unknown } | null;
  const essay = String(body?.essay ?? "").trim();
  const words = wordCount(essay);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });
  const user = networkId(request);
  if ((await subscriberUsedToday("use_quick", user).catch(() => 0)) >= PER_DAY) return Response.json({ error: "limit" }, { status: 429 });
  try {
    const { score } = await quickRead(essay);
    await recordSubscriberUse("use_quick", user);
    return Response.json({ score });
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[quick]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
