import { TooMany, verifyLoginCode } from "@/lib/essayodds/auth";
import { validEmail } from "@/lib/essayodds/auth-core";
import { isEssayOpen } from "@/lib/env";

export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = String(body?.email ?? "").trim();
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!validEmail(email) || code.length !== 6) return Response.json({ error: "code" }, { status: 400 });
  try {
    const session = await verifyLoginCode(email, code);
    return session ? Response.json({ ok: true, email: session.email }) : Response.json({ error: "code" }, { status: 400 });
  } catch (err) {
    if (err instanceof TooMany) return Response.json({ error: "limit" }, { status: 429 });
    console.error("[account/verify]", (err as Error).message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
