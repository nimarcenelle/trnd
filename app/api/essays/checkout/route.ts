import { NextResponse } from "next/server";

import { createAccessCheckout, paidAccess } from "@/lib/essayodds/access";
import { currentSession } from "@/lib/essayodds/auth";
import { parsePlan, PLANS, type Plan } from "@/lib/essayodds/plans";
import { isEssayOpen } from "@/lib/env";

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const forStudent = form?.get("for") === "student";
  try {
    let plan: Plan = PLANS[parsePlan(form?.get("plan"))];
    // Someone already holding the RD Pass pays only the difference for Pro.
    if (plan.id === "pro" && !forStudent && (await paidAccess().catch(() => null))?.plan === "rd") plan = { ...plan, name: "Pro upgrade", cents: PLANS.pro.cents - PLANS.rd.cents };
    // Signed in: Stripe checks out under the account's email, so the pass is tied to it.
    const session = await currentSession();
    return NextResponse.redirect(await createAccessCheckout(plan, forStudent, session?.email), 303);
  } catch (err) {
    console.error("[checkout]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
