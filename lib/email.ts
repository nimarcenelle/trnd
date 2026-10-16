import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Ad, Brand, ReportBody } from "@/lib/db/types";
import { env, isEmailConfigured } from "@/lib/env";
import { cleanCopy, daysRunningOf, libraryLink } from "@/lib/format";

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

/** A competitor ad in the email: the creative, who runs it, the hook, and the receipts. */
export interface EmailAd {
  ad: Pick<Ad, "archive_id" | "image_url" | "hook" | "body" | "title" | "started_at" | "stopped_at" | "active" | "score" | "variants">;
  rival: string;
  versions: number;
}

function adCard(e: EmailAd): string {
  const a = e.ad;
  const days = daysRunningOf(a);
  const versions = Math.max(e.versions, a.variants);
  const receipts = [days !== null ? `${days} days` : null, versions > 1 ? `${versions} versions` : null, a.score !== null && a.score !== undefined ? `score ${a.score}` : null].filter(Boolean).join(" · ");
  const hook = cleanCopy(a.hook) ?? cleanCopy(a.title) ?? cleanCopy(a.body)?.slice(0, 90) ?? "";
  const img = a.image_url ? `<img src="${esc(a.image_url)}" alt="" width="160" style="display:block;width:160px;height:120px;object-fit:cover;border-radius:6px;background:#eee">` : `<div style="width:160px;height:120px;border-radius:6px;background:#eee"></div>`;
  return `<tr><td style="padding:0 0 14px;vertical-align:top;width:160px"><a href="${libraryLink(a.archive_id)}">${img}</a></td><td style="padding:0 0 14px 12px;vertical-align:top;font-size:13px;line-height:1.5"><b>${esc(e.rival)}</b><br>${esc(hook)}<br><span style="color:#868680;font-size:12px">${esc(receipts)}</span></td></tr>`;
}

/** The email, as HTML: the headline, what to do, and the competitor ads our score ranks highest. */
export function reportEmailHtml(brand: Pick<Brand, "name">, body: ReportBody, topAds: EmailAd[] = [], counts = ""): string {
  const LABEL = { get_ahead: "Get ahead", win_choice: "Win the choice", counter: "Counter", ignore: "Ignore" } as const;
  const items = body.opportunities?.length
    ? body.opportunities
        .filter((o) => o.type !== "ignore")
        .slice(0, 3)
        .map((o) => `<li style="margin:0 0 12px"><span style="font-size:12px;color:#0f8a78">${LABEL[o.type]}</span><br><b>${esc(o.title)}</b><br>${esc(o.recommendation)}</li>`)
    : body.insights.slice(0, 3).map((i) => `<li style="margin:0 0 10px"><b>${esc(i.title)}</b><br>${esc(i.detail)}</li>`);
  const wall = topAds.length
    ? `<h2 style="font-size:14px;margin:22px 0 10px">What they keep paying for</h2><table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${topAds.map(adCard).join("")}</table>`
    : "";
  return `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND · ${esc(brand.name)}${counts ? ` · ${esc(counts)}` : ""}</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${esc(body.headline)}</h1>
<p style="line-height:1.6">${esc(body.summary)}</p>
<ul style="padding-left:18px;line-height:1.55">${items.join("")}</ul>${wall}
<p><a href="${env.siteUrl}/app" style="display:inline-block;background:#111110;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the full report</a></p>
</div>`;
}

/** The "your competitors moved" email, sent after an update report. */
export async function sendReportEmail(sb: SupabaseClient, brand: Brand, body: ReportBody, topAds: EmailAd[] = []): Promise<void> {
  const { data } = await sb.auth.admin.getUserById(brand.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const c = body.changes;
  const counts = c
    ? [
        `${c.launched} ads launched`,
        `${c.stopped} stopped`,
        c.site ? `${c.site} website changes` : null,
        c.emails ? `${c.emails} emails` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  await sendEmail(to, `Your competitors: ${body.headline}`, reportEmailHtml(brand, body, topAds, counts));
}
