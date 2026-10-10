import { getAdminRepo } from "@/lib/db/admin";
import { confirmEmail } from "@/lib/email/test-watch";
import { sendEmail } from "@/lib/email/send";
import { isEmailConfigured } from "@/lib/env";
import { isReadLive } from "@/lib/read/run";
import { MAX_OPEN_PER_EMAIL, parseWatchRequest, type WatchRequest } from "@/lib/watch/create";

/**
 * Public. The free read's "watch for my ad": stores the test as pending
 * and sends one confirmation email. Nothing is watched until the address
 * confirms, so the form can't be used to mail someone else. Limited per
 * visitor (in memory, best effort) and per address.
 */

const LIMIT_WINDOW_MS = 3600_000;
const LIMIT_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

function overLimit(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < LIMIT_WINDOW_MS);
  hits.set(key, [...recent, now]);
  return recent.length >= LIMIT_PER_WINDOW;
}

export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return Response.json({ ok: false, reason: "Bad origin." }, { status: 403 });
  if (!isReadLive()) return Response.json({ ok: false, reason: "Watching needs a live read. This one is an example." }, { status: 400 });
  if (!isEmailConfigured) return Response.json({ ok: false, reason: "Email isn't set up here yet." }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (overLimit(ip, Date.now())) return Response.json({ ok: false, reason: "That's a lot of watches for one hour. Try again later." }, { status: 429 });

  let body: WatchRequest;
  try {
    body = (await req.json()) as WatchRequest;
  } catch {
    return Response.json({ ok: false, reason: "Bad request body." }, { status: 400 });
  }
  const parsed = parseWatchRequest(body);
  if (!parsed.ok) return Response.json({ ok: false, reason: parsed.reason }, { status: 400 });

  const repo = getAdminRepo();
  const open = await repo.listTestWatches({ email: parsed.row.email, statuses: ["pending", "watching", "live"] }).catch(() => []);
  if (open.length >= MAX_OPEN_PER_EMAIL) {
    return Response.json({ ok: false, reason: `You're already watching ${open.length} tests. Let one finish first.` }, { status: 429 });
  }
  try {
    const watch = await repo.insertTestWatch(parsed.row);
    const email = confirmEmail(watch);
    const sent = await sendEmail({ to: watch.email, subject: email.subject, html: email.html });
    if (!sent.ok) return Response.json({ ok: false, reason: "We couldn't send the confirmation. Try again in a minute." }, { status: 502 });
    await repo.updateTestWatch(watch.id, { stages_sent: ["confirm"] }).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("[watch] create failed:", (err as Error).message);
    return Response.json({ ok: false, reason: "That didn't save. Try again in a minute." }, { status: 500 });
  }
}
