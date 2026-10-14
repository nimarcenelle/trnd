import { after } from "next/server";

import { createPreview, hashIp, runPreview } from "@/lib/preview";

/**
 * The home page's free report form posts here (a plain form, no JS needed):
 * start a read, or find this site's recent one, and go to its page. The read
 * runs after the redirect, within this function's time.
 */
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const site = String(form.get("site") ?? "").slice(0, 300);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const origin = new URL(req.url).origin;

  let result;
  try {
    result = await createPreview(site, hashIp(ip));
  } catch (err) {
    console.warn("[preview] could not start:", (err as Error).message);
    result = { error: "unconfigured" as const };
  }
  if ("error" in result) {
    return Response.redirect(`${origin}/report?${new URLSearchParams({ site, error: result.error })}`, 303);
  }
  if (result.start) {
    const url = result.start;
    after(() => runPreview(result.id, url));
  }
  return Response.redirect(`${origin}/report/${result.id}`, 303);
}
