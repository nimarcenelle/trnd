import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { unsubscribePostUrl, unsubscribeUrl } from "@/lib/auth/unsubscribe";
import type { Creator, IdeaRun, PlanBody } from "@/lib/db/types";
import { type Addon, ADDONS, money, planLabel, TIERS } from "@/lib/billing";
import { env, isEmailConfigured } from "@/lib/env";

/** Resend over REST. Unconfigured, a send is a logged no-op. */
export async function sendEmail(to: string, subject: string, html: string, headers?: Record<string, string>): Promise<void> {
  if (!isEmailConfigured) {
    console.warn(`[email] RESEND_API_KEY not set; skipped "${subject}" to ${to}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html, ...(headers ? { headers } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Three days before a trial's first charge: when, how much, and that cancelling takes two clicks. */
export async function sendTrialEndingEmail(sb: SupabaseClient, creator: Creator, chargeOn: Date, plan: string): Promise<void> {
  const { data } = await sb.auth.admin.getUserById(creator.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const price = planLabel(plan).replace(/^\w+ · /, "");
  const day = chargeOn.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND for creators · @${esc(creator.handle)}</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">Your free trial ends ${esc(day)}</h1>
<p style="line-height:1.6">On ${esc(day)} your plan continues at ${price}. Nothing to do if you'd like to keep getting a new plan every week.</p>
<p style="line-height:1.6">Not for you? Cancel in two clicks from Settings, and you won't be charged.</p>
<p><a href="${env.siteUrl}/app/settings#billing" style="display:inline-block;background:#0f8a78;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Manage my plan</a></p>
</div>`;
  await sendEmail(to, `Your TRND trial ends ${day}`, html);
}

/** Two days before a no-card trial ends: nothing will be charged; pick a plan to keep the weekly plans coming. */
export async function sendTrialEndingNoCardEmail(sb: SupabaseClient, creator: Creator, endsOn: Date): Promise<void> {
  const { data } = await sb.auth.admin.getUserById(creator.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const day = endsOn.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND for creators · @${esc(creator.handle)}</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">Your free trial ends ${esc(day)}</h1>
<p style="line-height:1.6">After that, your daily reads and new plans pause. Everything we found stays readable.</p>
<p style="line-height:1.6">To keep three scripts coming every week, pick Creator: ${money(TIERS.creator.year)} a year or ${money(TIERS.creator.month)} a month. We don't have a card on file, so nothing is charged unless you choose a plan.</p>
<p><a href="${env.siteUrl}/app/welcome?step=trial" style="display:inline-block;background:#0f8a78;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Pick my plan</a></p>
</div>`;
  await sendEmail(to, `Your TRND trial ends ${day}`, html);
}

const TYPE = { double_down: "Double down on you", borrow: "Borrow a format", ride: "Ride a trend early" } as const;

/** This week's plan: the answer and the three hooks, sent after each weekly scan, unless the creator turned it off. */
export async function sendPlanEmail(sb: SupabaseClient, creator: Creator, body: PlanBody): Promise<void> {
  if (creator.email_plans === false) return;
  const { data } = await sb.auth.admin.getUserById(creator.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const unsub = unsubscribeUrl(creator.id);
  const items = body.ideas
    .map((i, n) => `<li style="margin:0 0 14px"><span style="font-size:12px;color:#0f8a78;font-weight:700">${n + 1} · ${TYPE[i.type]}</span><br><b>${esc(i.hook)}</b><br><span style="color:#51514d">${esc(i.so)}</span></li>`)
    .join("");
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND for creators · @${esc(creator.handle)}</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${esc(body.headline.replace(/\*/g, ""))}</h1>
<p style="line-height:1.6">${esc(body.summary)}</p>
<ol style="padding-left:18px;line-height:1.55">${items}</ol>
<p><a href="${env.siteUrl}/app" style="display:inline-block;background:#0f8a78;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Open the scripts</a></p>
<p style="line-height:1.6;color:#51514d;font-size:14px">Know a creator who'd use this? Send them <a href="${env.siteUrl}/app/plan-card" style="color:#0f8a78">your plan card</a> or your link from the app: when they subscribe, you both get a free month.</p>
<p style="font-size:12px;color:#868680;margin-top:28px">A new plan every week while your plan is on. <a href="${unsub}" style="color:#868680">Stop these emails</a></p>
</div>`;
  await sendEmail(to, `What to post this week: ${body.ideas[0]?.hook.replace(/^["“]|["”]$/g, "") ?? body.headline}`, html, {
    "List-Unsubscribe": `<${unsubscribePostUrl(creator.id)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
}

/** An add-on was paid for: the team makes it, the buyer hears when to expect it. */
export async function sendAddonEmails(addon: Addon, buyer: string | null, handle: string | null): Promise<void> {
  const a = ADDONS[addon];
  const who = handle ? `@${handle}` : (buyer ?? "a buyer");
  await sendEmail(
    env.alertEmail,
    `To make: ${a.name} for ${who}`,
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto"><h1 style="font-size:20px">${esc(a.name)} paid</h1><p>For ${esc(who)}${buyer ? ` (${esc(buyer)})` : ""}. ${esc(a.blurb)}</p><p>Deliver within 3 business days and mark it delivered in addon_orders.</p></div>`,
  );
  if (!buyer) return;
  await sendEmail(
    buyer,
    `Your ${a.name.toLowerCase()} is on its way`,
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110"><p style="font-size:12px;color:#868680">TRND for creators${handle ? ` · @${esc(handle)}` : ""}</p><h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">Thanks. Your ${esc(a.name.toLowerCase())} is being made.</h1><p style="line-height:1.6">${esc(a.blurb)} It lands in this inbox within 3 business days. Reply to this email to tell us what it's for: a launch, a trip, a sale.</p></div>`,
  );
}

/**
 * The 48-hour check as a scorecard: how the idea did against their typical
 * video, and the next plan's first hook, so every result leads to the next
 * post. Sent with the weekly plan emails (off together from Settings).
 */
export async function sendScorecardEmail(sb: SupabaseClient, creator: Creator, run: IdeaRun, times: number | null, nextHook: string | null): Promise<void> {
  if (creator.email_plans === false || !run.result) return;
  const { data } = await sb.auth.admin.getUserById(creator.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const x = times !== null ? `${times}×` : null;
  const headline =
    run.result.read === "beat"
      ? `Your idea did ${x ?? "better than"} your typical.${nextHook ? " Next one builds on it." : ""}`
      : run.result.read === "in_range"
        ? `Your idea landed right around your typical${x ? ` (${x})` : ""}.`
        : `Your idea came in under your typical${x ? ` (${x})` : ""}. Here's what's next.`;
  const views = run.result.views !== null ? `${run.result.views.toLocaleString("en-US")} views in 48 hours` : "";
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111110">
<p style="font-size:12px;color:#868680">TRND for creators · @${esc(creator.handle)} · your 48-hour scorecard</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${esc(headline)}</h1>
<p style="line-height:1.6;margin:0 0 6px"><b>${esc(run.idea.hook)}</b></p>
<p style="line-height:1.6;color:#51514d;margin:0 0 18px">${esc(views)}${run.expected ? ` · your usual is ${run.expected.low.toLocaleString("en-US")}–${run.expected.high.toLocaleString("en-US")}` : ""}</p>
${nextHook ? `<p style="font-size:12px;color:#0f8a78;font-weight:700;margin:0">Next up</p><p style="line-height:1.6;margin:2px 0 18px"><b>${esc(nextHook)}</b></p>` : ""}
<p><a href="${env.siteUrl}/app?tab=loop&from=scorecard" style="display:inline-block;background:#0f8a78;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">See the scorecard</a></p>
<p style="font-size:12px;color:#868680;margin-top:28px"><a href="${unsubscribeUrl(creator.id)}" style="color:#868680">Stop plan emails</a></p>
</div>`;
  await sendEmail(to, headline, html, { "List-Unsubscribe": `<${unsubscribePostUrl(creator.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
}
