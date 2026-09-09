import { env, isEmailConfigured } from "@/lib/env";

/**
 * One email seam for the whole app (Resend REST — no SDK dependency).
 * Unconfigured, every send is a loud no-op so callers never branch.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Defaults to EMAIL_FROM — the prospector sends as the founder instead. */
  from?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; id?: string; skipped?: boolean }> {
  if (!isEmailConfigured) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${opts.subject}" to ${opts.to}`);
    return { ok: true, skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from || env.emailFrom,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: [opts.replyTo] } : {}),
    }),
  });
  if (!res.ok) {
    console.warn(`[email] send failed (${res.status}):`, (await res.text()).slice(0, 300));
    return { ok: false };
  }
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}
