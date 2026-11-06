import "server-only";

import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

import type { CreatorCheck } from "./check";
import { gapLine } from "./benchmark";
import { diagnosis, killerFromNumbers, stuckCount } from "./stats";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (f: number) => `${Math.round(f * 100)}%`;

/** The weekly re-check: this week's numbers, the pattern, three hooks, and the plan. */
export function recheckEmailHtml(c: CreatorCheck, token: string): string {
  const s = c.stats!;
  const site = env.siteUrl;
  const hooks = c.read?.next_hooks.length
    ? `<h2 style="font-size:14px;margin:22px 0 8px">Post next</h2><ul style="padding-left:18px;line-height:1.55;margin:0">${c.read.next_hooks
        .map((h) => `<li style="margin:0 0 10px"><b>&ldquo;${esc(h.hook)}&rdquo;</b><br><span style="color:#51514d">${esc(h.why)}</span></li>`)
        .join("")}</ul>`
    : "";
  const cell = (label: string, value: string) =>
    `<td style="padding:10px 12px;border:1px solid #e9e9e6;border-radius:8px;width:33%"><div style="font-size:12px;color:#868680">${label}</div><div style="font-size:20px;font-weight:600">${value}</div></td>`;
  return `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND · your weekly re-check · @${esc(c.handle ?? "")}</p>
<h1 style="font-size:24px;line-height:1.25;margin:0 0 10px">${esc(diagnosis(s))}</h1>
<p style="font-size:12px;color:#b42318;margin:0">What's killing your posts</p>
<p style="line-height:1.5;margin:2px 0 14px;font-weight:600">${esc(c.read?.killer ?? killerFromNumbers(s))}</p>
${c.benchmark ? `<p style="line-height:1.5;margin:0 0 14px">${esc(gapLine(c.benchmark))}</p>` : ""}
<table cellpadding="0" cellspacing="6" style="width:100%;border-collapse:separate"><tr>${cell("Usual post", String(Math.round(s.medianInteractions)))}${cell("Broke out", pct(s.breakoutRate))}${cell("Stalled", pct(s.stalledRate))}</tr></table>
${c.read ? `<p style="line-height:1.6;margin:18px 0 0">${esc(c.read.verdict)}</p>` : ""}${hooks}
<p><a href="${site}/check?handle=${encodeURIComponent(c.handle ?? "")}&platform=${c.platform}&src=email" style="display:inline-block;background:#111110;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">See the full report</a></p>
<p style="font-size:12px;color:#868680;margin-top:28px">You asked for this at ${esc(site.replace(/^https?:\/\//, ""))}/creators. <a href="${site}/creators/unsubscribe?t=${token}" style="color:#868680">Unsubscribe</a></p>
</div>`;
}

export async function sendRecheck(to: string, c: CreatorCheck, token: string): Promise<void> {
  await sendEmail(to, `@${c.handle} this week: ${stuckCount(c.stats!)} of ${c.stats!.posts.length} posts never got past your followers`, recheckEmailHtml(c, token));
}

/** Right after the onboarding: the private link to the report, so it isn't lost with the tab. */
export async function sendReportReady(to: string, c: CreatorCheck & { id: string; token: string }): Promise<void> {
  const s = c.stats!;
  const link = `${env.siteUrl}/r/${c.id}?k=${c.token}`;
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND · @${esc(c.handle ?? "")}</p>
<h1 style="font-size:24px;line-height:1.25;margin:0 0 10px">${esc(diagnosis(s))}</h1>
${c.benchmark ? `<p style="line-height:1.5;margin:0 0 14px">${esc(gapLine(c.benchmark))}</p>` : ""}
<p style="line-height:1.55;margin:0 0 18px;color:#51514d">Your report says what's killing them and what to post instead.</p>
<p><a href="${link}" style="display:inline-block;background:#111110;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open my report</a></p>
<p style="font-size:12px;color:#868680;margin-top:24px">This link is yours. Anyone with it can open the report.</p>
</div>`;
  await sendEmail(to, `@${c.handle}: ${stuckCount(s)} of ${s.posts.length} posts never got past your followers`, html);
}
