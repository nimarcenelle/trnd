import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

/**
 * Is this pick's written content there yet?
 *
 * The dashboard used to answer this by re-rendering itself every six
 * seconds until the read and the ad landed. `router.refresh()` re-renders
 * the whole server component, so an owner reading the page watched it blank
 * and repaint on a timer — "it'll load once then randomly scrub it and
 * reload" — up to fifteen times, and fourteen of those had nothing new to
 * show.
 *
 * This is the cheap question instead: two existence checks, no rendering,
 * no AI. The page polls it and refreshes exactly once, when there is
 * actually something new to paint.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("opportunity");
  if (!id) return Response.json({ error: "Which pick?" }, { status: 400 });

  const repo = await getUserRepo(user.id);
  // The repo is already scoped to this user, so a pick belonging to someone
  // else reads as absent rather than leaking that it exists.
  const [read, campaign] = await Promise.all([
    repo.getPickRead(id).catch(() => null),
    repo.getCampaignByOpportunity(id).catch(() => null),
  ]);

  return Response.json(
    { read: Boolean(read), campaign: Boolean(campaign) },
    { headers: { "cache-control": "no-store" } },
  );
}
