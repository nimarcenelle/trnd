import { cookies } from "next/headers";

import { currentSession } from "@/lib/essayodds/auth";
import { DEMO_COOKIE } from "@/lib/essayodds/demo";
import { isDataName, MAX_DATA_BYTES } from "@/lib/essayodds/auth-core";
import { putLatest, readSaved } from "@/lib/essayodds/saved";
import { isEssayOpen } from "@/lib/env";

/** An account's saved work: one encrypted row per name (the essay draft, odds answers, lists, Final Read). */
const keyFor = (uid: string, name: string) => `data:${uid}:${name}`;

/** In demo mode nothing is read from or written to an account, so recording never touches real work. */
const inDemo = async () => (await cookies()).get(DEMO_COOKIE)?.value === "1";

export async function GET(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const session = (await inDemo()) ? null : await currentSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const name = new URL(request.url).searchParams.get("name");
  if (!isDataName(name)) return Response.json({ error: "name" }, { status: 400 });
  const key = keyFor(session.uid, name);
  const row = (await readSaved<{ value: string }>([key])).get(key);
  return Response.json({ value: row?.value ?? null });
}

export async function PUT(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const session = (await inDemo()) ? null : await currentSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; value?: unknown } | null;
  if (!isDataName(body?.name) || typeof body?.value !== "string") return Response.json({ error: "bad" }, { status: 400 });
  if (body.value.length > MAX_DATA_BYTES) return Response.json({ error: "too_big" }, { status: 413 });
  await putLatest("user_data", keyFor(session.uid, body.name), { value: body.value });
  return Response.json({ ok: true });
}
