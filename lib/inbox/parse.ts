/**
 * Pure helpers for the competitor inbox: each rival's address, reading an
 * inbound-mail webhook (Resend, or any service that posts from/to/subject/
 * text/html as JSON), and finding a newsletter signup form on a site.
 */

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "brand";

/** A fresh token: 8 lowercase letters and digits, unguessable enough to keep strangers out of a rival's inbox. */
export function newToken(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/** "Clearwell", "k3x9q2ab", "in.usetrnd.com" → "clearwell-k3x9q2ab@in.usetrnd.com". */
export function inboxAddress(name: string, token: string, domain: string): string {
  return `${slug(name)}-${token}@${domain}`;
}

/** The rival token in any of an email's recipients on our domain, or null. */
export function tokenFromRecipients(to: string[], domain: string): string | null {
  for (const raw of to) {
    const addr = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase();
    const [local, host] = addr.split("@");
    if (!local || host !== domain.toLowerCase()) continue;
    const token = local.split("+")[0].split("-").pop();
    if (token && /^[a-z0-9]{6,16}$/.test(token)) return token;
  }
  return null;
}

export interface InboundEmail {
  to: string[];
  from: string;
  fromName: string | null;
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  date: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(strs) : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : isObj(v) && typeof v.email === "string" ? [String(v.email)] : [];

/** "Clearwell <hello@clearwell.co>" → name and address. */
export function splitFrom(from: string): { name: string | null; address: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || null, address: m[2].trim().toLowerCase() } : { name: null, address: from.trim().toLowerCase() };
}

/**
 * The email in a webhook body. Resend's `email.received` carries the envelope
 * under `data` and an `email_id` to fetch the body with; services that post
 * the whole message (a Cloudflare Email Worker, Postmark, SendGrid's JSON)
 * carry it at the top level. Returns the email and, when the body must be
 * fetched, Resend's id.
 */
export function readWebhook(payload: unknown): { email: InboundEmail; resendId: string | null } | null {
  if (!isObj(payload)) return null;
  const d = isObj(payload.data) ? payload.data : payload;
  const to = strs(d.to ?? d.To ?? d.recipient ?? d.envelope_to);
  const fromRaw = strs(d.from ?? d.From ?? d.sender)[0] ?? (isObj(d.from) ? String((d.from as Obj).email ?? "") : "");
  if (!to.length || !fromRaw) return null;
  const { name, address } = splitFrom(typeof d.from === "string" ? d.from : fromRaw);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    email: {
      to,
      from: address,
      fromName: str(d.from_name) ?? str(d.FromName) ?? name,
      subject: str(d.subject) ?? str(d.Subject) ?? "",
      text: str(d.text) ?? str(d.TextBody) ?? str(d.plain),
      html: str(d.html) ?? str(d.HtmlBody),
      messageId: str(d.message_id) ?? str(d.messageId) ?? str(d.MessageID) ?? str(d.email_id),
      date: str(d.created_at) ?? str(d.date) ?? str(d.Date),
    },
    resendId: payload.type === "email.received" ? str(d.email_id) : null,
  };
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;|&#160;|&zwnj;|&#8204;|&#847;|͏/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** A marketing email's HTML as readable text: headings and paragraphs on their own lines, no tracking pixels. */
export function emailText(html: string): string {
  return decode(
    html
      .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|tr|li|td)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** The links in an email that a reader could click, with their text. Unsubscribe and social links left out. */
export function emailLinks(html: string): { text: string; url: string }[] {
  const out: { text: string; url: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decode(m[1]).trim();
    const text = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (/unsubscribe|preferences|manage|view.*browser|privacy/i.test(`${text} ${url}`)) continue;
    if (/^https?:\/\/(?:www\.)?(facebook|instagram|tiktok|twitter|x|pinterest|youtube|linkedin)\.com/i.test(url)) continue;
    out.push({ text: text.slice(0, 120), url: url.slice(0, 1000) });
  }
  return [...new Map(out.map((l) => [l.url, l])).values()].slice(0, 30);
}

/** The double opt-in link in a "confirm your subscription" email, or null. */
export function confirmLink(email: { subject: string; text: string | null; links: { text: string; url: string }[] }): string | null {
  const ask = /confirm|verify|activate|complete (?:your )?(?:sign ?up|subscription)|opt.?in|double/i;
  if (!ask.test(email.subject) && !ask.test((email.text ?? "").slice(0, 600))) return null;
  const link = email.links.find((l) => ask.test(l.text) || /confirm|verify|opt.?in|subscribe\/confirm|list-manage\.com\/subscribe\/confirm/i.test(l.url));
  return link?.url ?? null;
}

export interface SignupForm {
  action: string;
  method: "GET" | "POST";
  fields: Record<string, string>;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;

/**
 * A newsletter form in a page's HTML, filled in with `email`: Shopify's
 * customer form, a Mailchimp embed, or any form whose only real field is an
 * email address. Login, search, cart and contact forms are left alone.
 */
export function findSignupForm(html: string, base: string, email: string): SignupForm | null {
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  const scored = forms
    .map((m) => {
      const open = m[1];
      const inner = m[2];
      const action = decode(attr(`<form ${open}>`, "action") ?? "");
      const inputs = [...inner.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)].map((i) => `<${i[1]} ${i[2]}>`);
      const emailInput = inputs.find((t) => /type=["']email["']/i.test(t) || /name=["'][^"']*e-?mail[^"']*["']/i.test(t));
      if (!emailInput) return null;
      if (/login|account\/(?!contact)|search|cart|checkout|recover|password|reset/i.test(action)) return null;
      const visible = inputs.filter((t) => !/type=["'](hidden|submit|button|checkbox|radio)["']/i.test(t) && t !== emailInput);
      if (visible.length > 1 || inputs.some((t) => /type=["']password["']/i.test(t))) return null;
      let score = 1;
      if (/newsletter|subscribe|signup|sign-up|klaviyo|list-manage|mailchimp/i.test(open + inner)) score += 2;
      if (/form_type["'][^>]*value=["']customer["']/i.test(inner)) score += 3;
      if (/contact\[tags\][^>]*newsletter/i.test(inner)) score += 2;
      return { open, inner, action, inputs, emailInput, score };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => b.score - a.score);
  const f = scored[0];
  if (!f) return null;

  const fields: Record<string, string> = {};
  for (const t of f.inputs) {
    const name = attr(t, "name");
    if (!name) continue;
    const type = (attr(t, "type") ?? "text").toLowerCase();
    if (t === f.emailInput) fields[name] = email;
    else if (type === "hidden") fields[name] = decode(attr(t, "value") ?? "");
    else if (type === "checkbox" && /accepts?_marketing|consent|newsletter|subscribe|opt/i.test(name)) fields[name] = attr(t, "value") ?? "true";
  }
  let action: string;
  try {
    action = new URL(f.action || base, base).toString();
  } catch {
    return null;
  }
  return { action, method: (attr(`<form ${f.open}>`, "method") ?? "GET").toUpperCase() === "POST" ? "POST" : "GET", fields };
}

/** The Klaviyo account a site uses, from its onsite script tag. */
export function klaviyoCompany(html: string): string | null {
  return html.match(/klaviyo\.com\/onsite\/js\/(?:klaviyo\.js)?\?company_id=([A-Za-z0-9]{5,8})/)?.[1] ?? html.match(/klaviyo[^"']{0,80}company_id=([A-Za-z0-9]{5,8})/)?.[1] ?? null;
}
