import { getAdminRepo } from "@/lib/db/admin";

/**
 * The confirmation button on /watch posts here. A POST and not the email
 * link itself, so a mail scanner that opens every link can't start a
 * watch nobody asked for.
 */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const back = (q: string) => Response.redirect(new URL(`/watch?${q}`, req.url), 303);
  if (!token) return back("done=missing");
  const repo = getAdminRepo();
  const watch = await repo.getTestWatchByToken(token).catch(() => null);
  if (!watch) return back("done=missing");
  if (watch.status === "pending") {
    await repo.updateTestWatch(watch.id, { status: "watching", confirmed_at: new Date().toISOString() });
  }
  return back(`done=confirmed&t=${encodeURIComponent(token)}`);
}
