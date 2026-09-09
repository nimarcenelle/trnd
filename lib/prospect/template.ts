import type { ProspectLead } from "./types";

/**
 * Outreach template rendering — pure string work, imported by both the send
 * route and the client-side preview so the two can never drift.
 *
 * Merge fields: {{name}}, {{city}}, {{category}}. The no-ads line only
 * appears when the crawl actually found no pixel — never a guess.
 */

export const DEFAULT_SUBJECT = "Quick question about {{name}}";

export const DEFAULT_BODY = `Hi — I'm Nick. I build TRND (usetrnd.com), a tool for local businesses.

I came across {{name}} while looking at businesses around {{city}}.{{no_ads_line}}

TRND watches what people near you are actually searching and talking about, and turns it into a ready-to-run ad campaign for your business — every day. Built for owners, not agencies.

If you'd like a free demand snapshot for {{name}} — what's trending in your area right now that you could act on this week — just reply and I'll send it over. No signup needed.

If you'd rather not hear from me, reply "no thanks" and I won't email again.

— Nick
TRND · usetrnd.com`;

const NO_ADS_LINE =
  " Noticed you're not running paid ads at the moment — that's usually who TRND helps most.";

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
