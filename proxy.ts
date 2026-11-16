import { NextResponse, type NextRequest } from "next/server";

/** TRND's app and sign-in routes don't exist here, so they lead home. EssayOdds' own /login is not matched. */
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/app/:path*", "/signup", "/forgot", "/auth/:path*"],
};
