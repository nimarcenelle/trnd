import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { isCode, REF_COOKIE } from "@/lib/referrals";

/** A referral link: remembers whose it was for 30 days, then the landing page's handle box. */
export async function GET(_req: Request, ctx: RouteContext<"/join/[code]">): Promise<Response> {
  const code = (await ctx.params).code.toLowerCase();
  const res = NextResponse.redirect(`${env.siteUrl}/?ref=1#start`);
  if (isCode(code)) res.cookies.set(REF_COOKIE, code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
  return res;
}
