import { getAdminRepo } from "@/lib/db/admin";

/** The stop button on /watch posts here; the email link only opens the page. */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const back = (q: string) => Response.redirect(new URL(`/watch?${q}`, req.url), 303);
  if (!token) return back("done=missing");
  const repo = getAdminRepo();
  const watch = await repo.getTestWatchByToken(token).catch(() => null);
  if (!watch) return back("done=missing");
  if (watch.status !== "stopped") await repo.updateTestWatch(watch.id, { status: "stopped", ended_at: new Date().toISOString() });
  return back("done=stopped");
}
