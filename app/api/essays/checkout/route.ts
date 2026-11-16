import { NextResponse } from "next/server";

import { createAccessCheckout } from "@/lib/essayodds/access";
import { currentSession } from "@/lib/essayodds/auth";
import { parsePlan, PLANS } from "@/lib/essayodds/plans";
import { isEssayOpen } from "@/lib/env";

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  try {
    // Signed in: Stripe checks out under the account's email, so the pass is tied to it.
    const session = await currentSession();
    return NextResponse.redirect(await createAccessCheckout(PLANS[parsePlan(form?.get("plan"))], form?.get("for") === "student", session?.email), 303);
  } catch (err) {
    console.error("[checkout]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
