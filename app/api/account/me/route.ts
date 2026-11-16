import { currentSession } from "@/lib/essayodds/auth";

/** Who is signed in, for headers on pages that are built ahead of time. */
export async function GET(): Promise<Response> {
  const session = await currentSession();
  return session ? Response.json({ email: session.email }, { headers: { "cache-control": "no-store" } }) : Response.json({ email: null }, { status: 401, headers: { "cache-control": "no-store" } });
}
