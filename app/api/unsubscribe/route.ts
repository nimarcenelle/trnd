import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";
import { checkUnsubscribeToken } from "@/lib/unsubscribe";

/**
 * Turn off a brand's update emails from the link in the email (GET), or from
 * the mail client's one-click unsubscribe (POST, RFC 8058).
 */

async function unsubscribe(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const b = url.searchParams.get("b") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!checkUnsubscribeToken(b, t)) return false;
  const { error } = await adminSupabase().from("brands").update({ email_updates: false }).eq("id", b);
  return !error;
}

const page = (ok: boolean) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TRND</title></head>
<body style="font-family:Inter,system-ui,sans-serif;color:#111110;background:#fff;max-width:480px;margin:80px auto;padding:0 16px;line-height:1.55">
<p style="font-weight:600;letter-spacing:.3em">TRND</p>
<h1 style="font-size:22px;margin:24px 0 8px">${ok ? "You won't get update emails anymore." : "That link didn't work."}</h1>
<p style="color:#51514d">${ok ? "Your briefing still updates every day in the app." : "It may be incomplete."} You can turn emails ${ok ? "back on" : "off"} any time in <a href="${env.siteUrl}/app/settings#notifications" style="color:#0f8a78">Settings</a>.</p>
</body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );

export async function GET(req: Request): Promise<Response> {
  return page(await unsubscribe(req));
}

export async function POST(req: Request): Promise<Response> {
  return new Response(null, { status: (await unsubscribe(req)) ? 200 : 400 });
}
