import { NextResponse, type NextRequest } from "next/server";

import { accessFor, ACCESS_COOKIE, addPurchase } from "@/lib/essayodds/access";
import { currentSession } from "@/lib/essayodds/auth";
import { emailAccessOnce } from "@/lib/essayodds/access-email";
import { env, isEssayOpen } from "@/lib/env";

/** Where Stripe returns a buyer, and where a saved access link lands on any device. */
export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get("session_id") ?? "";
  const access = isEssayOpen ? await accessFor(id).catch(() => null) : null;
  const paid = access !== null;
  // The first return from checkout emails the link, so a lost cookie never means lost access.
  if (access) await emailAccessOnce({ id, ...access }).catch((err) => console.error("[access-email]", (err as Error).message));
  // Signed in at checkout: the pass now belongs to the account, on every device.
  const session = access ? await currentSession() : null;
  if (session) await addPurchase(session.uid, id).catch((err) => console.error("[access] link purchase", (err as Error).message));
  const response = NextResponse.redirect(`${env.siteUrl}/essay${paid ? "?welcome=1" : ""}`, 303);
  if (paid) response.cookies.set(ACCESS_COOKIE, id, { httpOnly: true, secure: env.siteUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return response;
}
