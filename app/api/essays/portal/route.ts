import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ACCESS_COOKIE, subscriptionPortal } from "@/lib/admitted/access";
import { env, isEssayOpen } from "@/lib/env";

/** Sends a subscriber to Stripe to cancel or change their card. Works after cancelling too. */
export async function POST(): Promise<Response> {
  const id = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!isEssayOpen || !id) return NextResponse.redirect(`${env.siteUrl}/essay`, 303);
  try {
    return NextResponse.redirect(await subscriptionPortal(id), 303);
  } catch (err) {
    console.error("[portal]", err);
    return NextResponse.redirect(`${env.siteUrl}/essay`, 303);
  }
}
