import { networkId, paidSession, subscriberId } from "@/lib/essayodds/access";
import { isDemoList } from "@/lib/essayodds/demo";
import { reviewList } from "@/lib/essayodds/lists";
import { MAX_INPUT, parseKind } from "@/lib/essayodds/lists-core";
import { EssayCapReached } from "@/lib/essayodds/review";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 120;

/** Subscribers only, capped a day. */
const PER_DAY = 30;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; text?: unknown } | null;
  const text = String(body?.text ?? "").trim();
  if (text.length < 20 || text.length > MAX_INPUT) return Response.json({ error: "length" }, { status: 400 });
  const session = await paidSession();
  if (!session) return Response.json({ error: "payment_required" }, { status: 402 });
  if (session === "demo" && !isDemoList(text)) return Response.json({ error: "demo_only" }, { status: 402 });
  const user = session === "demo" ? networkId(request) : subscriberId(session);
  if ((await subscriberUsedToday("use_lists", user).catch(() => 0)) >= PER_DAY) return Response.json({ error: "limit" }, { status: 429 });
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
