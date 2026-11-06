import { redirect } from "next/navigation";

import { cleanSrc, isHandle } from "@/lib/creator/check";
import { logEvent } from "@/lib/creator/store";
import { normHandle } from "@/lib/social/read";

/**
 * "Start free" on the creator plan. Counted here because this click is the
 * demand test: it says whether anyone wants the plan before it is built.
 * Until it is, the click lands on the plan's early-access page.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const handle = normHandle(url.searchParams.get("handle") ?? "");
  const platform = url.searchParams.get("platform") === "instagram" ? "instagram" : "tiktok";
  const src = cleanSrc(url.searchParams.get("src"));
  await logEvent("upgrade_click", { handle: isHandle(handle) ? handle : undefined, platform, src });
  const q = new URLSearchParams({ platform, ...(isHandle(handle) ? { handle } : {}), ...(src ? { src } : {}) });
  redirect(`/creators/plan?${q}`);
}
