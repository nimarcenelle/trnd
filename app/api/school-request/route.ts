import { createHash } from "node:crypto";

import { countToday, saveFirst } from "@/lib/admitted/saved";
import { parseSchoolRequest } from "@/lib/admitted/school-request";
import { env } from "@/lib/env";

const DAILY_CAP = 500;

/** Requests sit in ai_results under kind school_request, one row per email and school. */
export async function POST(request: Request): Promise<Response> {
  if (!env.supabaseServiceRoleKey) return Response.json({ error: "not_open" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { school?: unknown; email?: unknown } | null;
  const entry = parseSchoolRequest(body?.school, body?.email);
  if (!entry) return Response.json({ error: "bad_input" }, { status: 400 });
  try {
    if ((await countToday("school_request")) >= DAILY_CAP) return Response.json({ error: "busy" }, { status: 429 });
    const key = "school_request:" + createHash("sha256").update(`${entry.email}|${entry.school.toLowerCase()}`).digest("hex");
    await saveFirst("school_request", [{ key, value: entry }]);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[school-request]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
