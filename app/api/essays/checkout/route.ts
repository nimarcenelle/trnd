import { NextResponse } from "next/server";

import { createAccessCheckout } from "@/lib/admitted/access";
import { parsePlan, PLANS } from "@/lib/admitted/plans";
import { isEssayOpen } from "@/lib/env";

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  try {
    return NextResponse.redirect(await createAccessCheckout(PLANS[parsePlan(form?.get("plan"))], form?.get("for") === "student"), 303);
  } catch (err) {
    console.error("[checkout]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
