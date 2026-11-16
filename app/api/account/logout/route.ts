import { NextResponse } from "next/server";

import { ACCESS_COOKIE, LEGACY_ACCESS_COOKIE } from "@/lib/essayodds/access";
import { endSession } from "@/lib/essayodds/auth";
import { env } from "@/lib/env";

/** Signs out of the account and drops any access cookie this browser held, so a shared computer is left clean. */
export async function POST(): Promise<Response> {
  await endSession();
  const res = NextResponse.redirect(`${env.siteUrl}/`, 303);
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(LEGACY_ACCESS_COOKIE);
  return res;
}
