import { networkId } from "@/lib/essayodds/access";
import { sendLoginCode, TooMany } from "@/lib/essayodds/auth";
import { validEmail } from "@/lib/essayodds/auth-core";
import { isEssayOpen } from "@/lib/env";

/** Emails a sign-in code. The same reply whether or not the email has an account. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email ?? "").trim();
  if (!validEmail(email)) return Response.json({ error: "email" }, { status: 400 });
  try {
    await sendLoginCode(email, networkId(request));
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof TooMany) return Response.json({ error: "limit" }, { status: 429 });
    console.error("[account/code]", (err as Error).message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
