import { NextResponse } from "next/server";

import { DEMO_COOKIE } from "@/lib/essayodds/demo";
import { env } from "@/lib/env";

/** Turns demo mode on for this browser for 12 hours. */
export function GET(): Response {
  const res = NextResponse.redirect(`${env.siteUrl}/demo`, 303);
  res.cookies.set(DEMO_COOKIE, "1", { httpOnly: true, secure: env.siteUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return res;
}
