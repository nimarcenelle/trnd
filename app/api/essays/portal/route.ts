import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ACCESS_COOKIE, LEGACY_ACCESS_COOKIE, subscriptionPortal } from "@/lib/essayodds/access";
import { env, isEssayOpen } from "@/lib/env";

/**
 * Sends a subscriber to Stripe to cancel or change their card. Works after cancelling too. A parent who paid has no
 * cookie, so the session id can come from the form; it is the same secret the access link already carries.
 */
export async function POST(request: Request): Promise<Response> {
  const posted = (await request.formData().catch(() => null))?.get("session_id");
  const jar = await cookies();
  const id = jar.get(ACCESS_COOKIE)?.value ?? jar.get(LEGACY_ACCESS_COOKIE)?.value ?? (typeof posted === "string" ? posted : "");
  if (!isEssayOpen || !id) return NextResponse.redirect(`${env.siteUrl}/essay`, 303);
  try {
    return NextResponse.redirect(await subscriptionPortal(id), 303);
  } catch (err) {
    console.error("[portal]", err);
    return NextResponse.redirect(`${env.siteUrl}/essay`, 303);
  }
}
