import { networkId, paidSession, subscriberId } from "@/lib/admitted/access";
import { reviewList } from "@/lib/admitted/lists";
import { MAX_INPUT, parseKind } from "@/lib/admitted/lists-core";
import { EssayCapReached } from "@/lib/admitted/review";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/admitted/saved";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 120;

/** Free for everyone, capped a day: per network without a plan, per subscriber with one. */
const PER_DAY = { free: 5, paid: 30 };

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; text?: unknown } | null;
  const text = String(body?.text ?? "").trim();
  if (text.length < 20 || text.length > MAX_INPUT) return Response.json({ error: "length" }, { status: 400 });
  const session = await paidSession();
  const user = session ? subscriberId(session) : networkId(request);
  if ((await subscriberUsedToday("use_lists", user).catch(() => 0)) >= (session ? PER_DAY.paid : PER_DAY.free)) return Response.json({ error: "limit" }, { status: 429 });
  try {
    const result = await reviewList(parseKind(body?.kind), text);
    await recordSubscriberUse("use_lists", user);
    return Response.json(result);
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[lists]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
