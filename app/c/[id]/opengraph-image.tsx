import { ImageResponse } from "next/og";

import { PreviewImage } from "@/lib/creator/card-image";
import { getCheck } from "@/lib/creator/store";

export const alt = "A creator's last 12 posts: which broke out and which stalled";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview for a shared result: the number and the bars. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCheck(id);
  if (!c?.stats || !c.handle) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", fontSize: 48 }}>TRND for creators</div>, size);
  }
  return new ImageResponse(<PreviewImage d={{ handle: c.handle, platform: c.platform ?? "tiktok", followers: c.followers, stats: c.stats, killer: c.read?.killer ?? c.read?.stop }} />, size);
}
