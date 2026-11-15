import { cookies } from "next/headers";

import { DAILY_LIMITS, FREE_COOKIE, FREE_PER_NETWORK_PER_DAY, networkId, paidSession, subscriberId } from "@/lib/admitted/access";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/admitted/saved";
import { EssayCapReached, reviewEssay } from "@/lib/admitted/review";
import { parseWordLimit, reviewKey, wordCount } from "@/lib/admitted/review-core";
import { env, isEssayOpen } from "@/lib/env";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { essay?: unknown; prompt?: unknown; limit?: unknown } | null;
  const essay = String(body?.essay ?? "").trim();
  const prompt = String(body?.prompt ?? "").trim().slice(0, 500);
  const limit = parseWordLimit(body?.limit);
  const words = wordCount(essay);
  if (words < 50 || words > 1000) return Response.json({ error: "length" }, { status: 400 });

  const session = await paidSession();
  const jar = await cookies();
  const key = reviewKey(essay, prompt, limit);
  let free = false;
  let user: string;
  if (session) {
    user = subscriberId(session);
    if ((await subscriberUsedToday("use_review", user).catch(() => 0)) >= DAILY_LIMITS.review) return Response.json({ error: "subscriber_limit" }, { status: 429 });
  } else {
    // No plan: the one free review, or the draft it was already spent on.
    const spent = jar.get(FREE_COOKIE)?.value;
    if (spent && spent !== key) return Response.json({ error: "free_used" }, { status: 402 });
    user = networkId(request);
    if (!spent && (await subscriberUsedToday("use_free", user).catch(() => 0)) >= FREE_PER_NETWORK_PER_DAY) return Response.json({ error: "free_used" }, { status: 402 });
    free = !spent;
  }

  try {
    const result = await reviewEssay(essay, prompt, limit);
    if (session) await recordSubscriberUse("use_review", user);
    if (free) {
      await recordSubscriberUse("use_free", user);
      jar.set(FREE_COOKIE, key, { httpOnly: true, secure: env.siteUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
    }
    return Response.json(result);
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 429 });
    console.error("[review]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
