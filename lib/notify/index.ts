import "server-only";

/**
 * Founder notifications — the selling loop's missing wire. A demo request
 * or a new signup that lands silently in a table is a lead lost; this module
 * pushes each one to wherever the founder actually looks:
 *
 * - NOTIFY_WEBHOOK_URL   → POST {text} JSON (Slack/Discord/Zapier-compatible)
 * - RESEND_API_KEY
 *   + NOTIFY_EMAIL_TO    → email via Resend's REST API (no SDK needed)
 *
 * Both optional, both fire-and-forget: a lead notification must never break
 * or slow the signup it announces. Without either env var this is a no-op.
 */

const WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL ?? "";
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_TO = process.env.NOTIFY_EMAIL_TO ?? "";
const EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM || "TRND <notifications@usetrnd.com>";

export const isNotifyConfigured = Boolean(WEBHOOK_URL || (RESEND_KEY && EMAIL_TO));

export type FounderEvent =
  | {
      kind: "demo_request";
      fullName: string;
      email: string;
      businessName: string;
      category: string | null;
      website: string | null;
      monthlySpend: string | null;
    }
  | { kind: "signup"; email: string; businessName: string; category: string; city: string }
  | {
      kind: "pilot_application";
      fullName: string;
      email: string;
      brandName: string;
      website: string | null;
      monthlySpend: string | null;
      objective: string | null;
      production: string | null;
      whatNext: string | null;
    };

/** One plain-text line per event — readable in Slack, a subject line, or a log. */
export function formatFounderEvent(event: FounderEvent): { subject: string; body: string } {
  if (event.kind === "demo_request") {
    return {
      subject: `TRND demo request — ${event.businessName}`,
      body: [
        `New demo request`,
        `Business: ${event.businessName}${event.category ? ` (${event.category})` : ""}`,
        `Contact: ${event.fullName} <${event.email}>`,
        event.website ? `Website: ${event.website}` : null,
        event.monthlySpend ? `Monthly ad spend: ${event.monthlySpend}` : null,
        event.website
          ? `They were promised a live example built from their site before the call.`
          : `They were promised a live example for their kind of business before the call.`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  if (event.kind === "pilot_application") {
    return {
      subject: `TRND pilot application — ${event.brandName}`,
      body: [
        `New pilot application`,
        `Brand: ${event.brandName}`,
        `Contact: ${event.fullName} <${event.email}>`,
        event.website ? `Website: ${event.website}` : null,
        event.monthlySpend ? `Monthly Meta spend: ${event.monthlySpend}` : null,
        event.objective ? `Optimizes for: ${event.objective}` : null,
        event.production ? `Creative made by: ${event.production}` : null,
        event.whatNext ? `Last made / stuck on: ${event.whatNext}` : null,
        `They were told: we read every application and reply by email. Nothing has been scanned or charged.`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return {
    subject: `TRND signup — ${event.businessName}`,
    body: [
      `New business on trial`,
      `Business: ${event.businessName} (${event.category}) — ${event.city}`,
      `Owner: ${event.email}`,
      `Trial clock: 14 days from now.`,
    ].join("\n"),
  };
}

async function post(url: string, headers: Record<string, string>, payload: unknown): Promise<void> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) console.warn(`[notify] ${new URL(url).hostname} answered HTTP ${res.status}`);
  } finally {
    clearTimeout(t);
  }
}

/** Best-effort delivery to every configured channel. Never throws. */
export async function notifyFounder(event: FounderEvent): Promise<void> {
  if (!isNotifyConfigured) return;
  const { subject, body } = formatFounderEvent(event);
  const jobs: Promise<void>[] = [];
  if (WEBHOOK_URL) {
    jobs.push(post(WEBHOOK_URL, {}, { text: `${subject}\n${body}` }));
  }
  if (RESEND_KEY && EMAIL_TO) {
    jobs.push(
      post(
        "https://api.resend.com/emails",
        { authorization: `Bearer ${RESEND_KEY}` },
        { from: EMAIL_FROM, to: [EMAIL_TO], subject, text: body },
      ),
    );
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") {
      console.warn("[notify] delivery failed (non-fatal):", (r.reason as Error)?.message ?? r.reason);
    }
  }
}
