import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Brand, ReportBody } from "@/lib/db/types";
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

/** The "your rivals changed their ads" email, sent after an update report. */
export async function sendReportEmail(sb: SupabaseClient, brand: Brand, body: ReportBody): Promise<void> {
  const { data } = await sb.auth.admin.getUserById(brand.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const c = body.changes;
  const counts = c ? `${c.launched} launched · ${c.stopped} stopped · ${c.proven} now past 21 days` : "";
  const insights = body.insights
    .slice(0, 3)
    .map((i) => `<li style="margin:0 0 10px"><b>${esc(i.title)}</b><br>${esc(i.detail)}</li>`)
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#23201a">
<p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6f6759">TRND · ${esc(brand.name)} · ${esc(counts)}</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${esc(body.headline)}</h1>
<p style="line-height:1.6">${esc(body.summary)}</p>
<ul style="padding-left:18px;line-height:1.55">${insights}</ul>
<p><a href="${env.siteUrl}/app" style="display:inline-block;background:#23201a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the full report</a></p>
</div>`;
  await sendEmail(to, `Rival ads: ${body.headline}`, html);
}
