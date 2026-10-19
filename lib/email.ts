import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Creator, PlanBody } from "@/lib/db/types";
import { env, isEmailConfigured } from "@/lib/env";

/** Resend over REST. Unconfigured, a send is a logged no-op. */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!isEmailConfigured) {
    console.warn(`[email] RESEND_API_KEY not set; skipped "${subject}" to ${to}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TYPE = { double_down: "Double down on you", borrow: "Borrow a format", ride: "Ride a trend early" } as const;

/** This week's plan: the answer and the three hooks, sent after each weekly scan. */
export async function sendPlanEmail(sb: SupabaseClient, creator: Creator, body: PlanBody): Promise<void> {
  const { data } = await sb.auth.admin.getUserById(creator.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const items = body.ideas
    .map((i, n) => `<li style="margin:0 0 14px"><span style="font-size:12px;color:#e0245e;font-weight:700">${n + 1} · ${TYPE[i.type]}</span><br><b>${esc(i.hook)}</b><br><span style="color:#625b6a">${esc(i.so)}</span></li>`)
    .join("");
  const html = `<div style="font-family:Figtree,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#17131b">
<p style="font-size:12px;color:#8f879a">TRND for creators · @${esc(creator.handle)}</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${esc(body.headline.replace(/\*/g, ""))}</h1>
<p style="line-height:1.6">${esc(body.summary)}</p>
<ol style="padding-left:18px;line-height:1.55">${items}</ol>
<p><a href="${env.siteUrl}/app" style="display:inline-block;background:#e0245e;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Open the scripts</a></p>
</div>`;
  await sendEmail(to, `What to post this week: ${body.ideas[0]?.hook.replace(/^["“]|["”]$/g, "") ?? body.headline}`, html);
}
