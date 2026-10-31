import { nextTikTokCard } from "@/lib/preview/card";
import { nextTikTok } from "@/lib/preview/next-tiktok";
import { getPreview } from "@/lib/preview/run";

/** Idea 1 of a ready preview as the shareable "Your next TikTok" image. */
export async function GET(_req: Request, ctx: RouteContext<"/start/[id]/card">) {
  const { id } = await ctx.params;
  const p = await getPreview(id);
  const idea = p?.status === "ready" ? p.plan?.ideas[0] : undefined;
  if (!p || !idea) return new Response("Not found", { status: 404 });
  return nextTikTokCard(nextTikTok(p.handle, idea));
}
