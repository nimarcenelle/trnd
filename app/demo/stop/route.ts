import { NextResponse } from "next/server";

import { DEMO_COOKIE } from "@/lib/essayodds/demo";
import { env } from "@/lib/env";

export function GET(): Response {
  const res = NextResponse.redirect(`${env.siteUrl}/demo`, 303);
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
