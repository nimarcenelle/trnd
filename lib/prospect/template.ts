import type { ProspectLead } from "./types";

/**
 * Outreach template rendering — pure string work, imported by both the send
 * route and the client-side preview so the two can never drift.
 *
 * Merge fields: {{name}}, {{city}}, {{category}}. The no-ads line only
 * appears when the crawl actually found no pixel — never a guess.
 */

// Cold-email craft, for the default: short enough to read on a phone lock
// screen, one concrete personalized observation, one CTA answerable with a
// single word, and an explicit easy out. No links beyond the domain mention —
// link-heavy cold email trips spam filters and reads like a blast.
export const DEFAULT_SUBJECT = "idea for {{name}}";

export const DEFAULT_BODY = `Hi — Nick here. Founder, not an agency, so I'll keep this short.

I was looking at {{category}} spots around {{city}} and found {{name}}.{{no_ads_line}}

I built a tool called TRND that reads what people near {{city}} are searching and talking about right now, and turns it into a ready-to-run ad for your business — automatically, every day.

Can I send you a free demand snapshot for {{name}}? One page: the three things trending in your area this week you could put an offer on. Reply "sure" and it's yours — no signup, no call, nothing to cancel.

And if this isn't for you, reply "no thanks" and that's the last you'll hear from me.

— Nick, founder of TRND
usetrnd.com`;

const NO_ADS_LINE =
  " Noticed you're not running any paid ads right now — that usually means you're leaving the easy demand to whoever is.";

export function renderTemplate(template: string, lead: ProspectLead): string {
  return template
    .replaceAll("{{name}}", lead.name)
    .replaceAll("{{city}}", lead.city ?? "your area")
    .replaceAll("{{category}}", (lead.category ?? "local business").toLowerCase())
    .replaceAll("{{no_ads_line}}", lead.adPixels.length === 0 && lead.website ? NO_ADS_LINE : "");
}

/** Plain paragraphs, escaped — reads like a person typed it, because one did. */
export function bodyToHtml(body: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font:15px/1.55 -apple-system,Segoe UI,sans-serif;color:#222">${esc(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
