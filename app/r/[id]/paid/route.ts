import { NextResponse } from "next/server";

import { paidSession } from "@/lib/billing/stripe";
import { PAID_COOKIE, paidCookieOptions, paidCookieValue } from "@/lib/creator/access";
import { getCheck, logEvent, markCheckPaid, upsertCustomer } from "@/lib/creator/store";
import { env } from "@/lib/env";

/**
 * Where Checkout returns. Confirms the session with Stripe, marks the check
 * paid, gives the browser its signed creator cookie (so later reports unlock
 * while the plan is live), and goes to the full report.
 */
export async function GET(req: Request, { params }: RouteContext<"/r/[id]/paid">): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("k") ?? "";
  const sessionId = url.searchParams.get("session_id") ?? "";
  const check = await getCheck(id);
  if (!check || check.token !== token) return new Response("not found", { status: 404 });
  const report = `${env.siteUrl}/r/${id}?k=${token}`;
  if (!sessionId) return NextResponse.redirect(report);

  try {
    const paid = await paidSession(sessionId, id);
    if (!paid) return NextResponse.redirect(`${report}&unpaid=1`);
    if (await markCheckPaid(id, sessionId)) await logEvent("paid", { handle: check.handle, platform: check.platform, meta: { id, session: sessionId, via: "return" } });
    const res = NextResponse.redirect(`${report}&welcome=1`);
    if (paid.customerId) {
      await upsertCustomer({ customerId: paid.customerId, email: paid.email, subscriptionId: paid.subscriptionId });
      res.cookies.set(PAID_COOKIE, paidCookieValue(paid.customerId), paidCookieOptions);
    }
    return res;
  } catch (e) {
    console.warn("[creator] checkout return failed:", (e as Error).message);
    return NextResponse.redirect(`${report}&unpaid=1`);
  }
}
