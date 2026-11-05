import { NextResponse } from "next/server";

import { createSubscriptionCheckout } from "@/lib/admitted/access";
import { isEssayOpen } from "@/lib/env";

export async function POST(): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  try {
    return NextResponse.redirect(await createSubscriptionCheckout(), 303);
  } catch (err) {
    console.error("[checkout]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
