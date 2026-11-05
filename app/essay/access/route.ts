import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, isSubscriptionActive } from "@/lib/admitted/access";
import { env, isEssayOpen } from "@/lib/env";

/** Where Stripe returns a buyer, and where a saved access link lands on any device. */
export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get("session_id") ?? "";
  const paid = isEssayOpen && (await isSubscriptionActive(id).catch(() => false));
  const response = NextResponse.redirect(`${env.siteUrl}/essay${paid ? "?welcome=1" : ""}`, 303);
  if (paid) response.cookies.set(ACCESS_COOKIE, id, { httpOnly: true, secure: env.siteUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return response;
}
