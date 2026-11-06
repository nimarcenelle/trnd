import { ImageResponse } from "next/og";

import { StoryImage } from "@/lib/creator/card-image";
import { getCheck } from "@/lib/creator/store";

/** The result as a 1080x1920 image: TikTok photo mode, Instagram and TikTok stories. ?dl=1 downloads it. */
export async function GET(req: Request, { params }: RouteContext<"/c/[id]/story">): Promise<Response> {
  const { id } = await params;
  const c = await getCheck(id);
  if (!c?.stats || !c.handle) return new Response("not found", { status: 404 });
  const img = new ImageResponse(<StoryImage d={{ handle: c.handle, platform: c.platform ?? "tiktok", followers: c.followers, stats: c.stats, killer: c.read?.killer ?? c.read?.stop }} />, { width: 1080, height: 1920 });
  const headers = new Headers(img.headers);
  headers.set("cache-control", "public, max-age=86400, immutable");
  if (new URL(req.url).searchParams.get("dl")) headers.set("content-disposition", `attachment; filename="trnd-${c.handle}.png"`);
  return new Response(img.body, { headers });
}
