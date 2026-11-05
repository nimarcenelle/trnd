import { NextResponse, type NextRequest } from "next/server";

/** Accounts are not part of Admitted, so the sign-in and app routes lead home. */
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup", "/forgot", "/auth/:path*"],
};
