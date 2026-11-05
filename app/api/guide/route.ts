import { createHash } from "node:crypto";

import { GUIDE_PATH, parseEmail } from "@/lib/admitted/leads";
import { countToday, saveFirst } from "@/lib/admitted/saved";
import { env } from "@/lib/env";

const DAILY_CAP = 2000;

/** Keeps the email under kind guide_request, one row per address, and hands back the guide. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = parseEmail(body?.email);
  if (!email) return Response.json({ error: "bad_input" }, { status: 400 });
  if (env.supabaseServiceRoleKey) {
    try {
      if ((await countToday("guide_request")) < DAILY_CAP) {
        const key = "guide_request:" + createHash("sha256").update(email).digest("hex");
        await saveFirst("guide_request", [{ key, value: { email, at: new Date().toISOString() } }]);
      }
    } catch (err) {
      // The guide still goes out if saving fails; a lost email beats a broken promise.
      console.error("[guide]", err);
    }
  }
  return Response.json({ ok: true, url: GUIDE_PATH });
}
