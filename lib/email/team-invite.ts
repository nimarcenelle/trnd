import { env } from "@/lib/env";

import { sendEmail } from "./send";

/**
 * The invitation a teammate gets: who invited them, to which brand, and
 * the one link. They sign up with this email and the brand is theirs to
 * see; during the pilot the invite code is not asked of an invited email.
 */
export function inviteEmailHtml(opts: { brand: string; inviter: string; email: string }): string {
  const url = `${env.appUrl}/signup?email=${encodeURIComponent(opts.email)}`;
  return [
    `<p>${escape(opts.inviter)} added you to <b>${escape(opts.brand)}</b> on TRND.</p>`,
    `<p>TRND writes the brand's weekly creative test briefs. You will see this week's tests, the campaigns in progress and the track record.</p>`,
    `<p><a href="${url}">Create your account with this email</a> (${escape(opts.email)}) and the brand is there when you sign in.</p>`,
    `<p style="color:#888;font-size:12px">If you were not expecting this, ignore it; nothing is shared until you sign in.</p>`,
  ].join("\n");
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export async function sendTeamInvite(opts: { brand: string; inviter: string; email: string }): Promise<{ ok: boolean; skipped?: boolean }> {
  return sendEmail({
    to: opts.email,
    subject: `${opts.inviter} added you to ${opts.brand} on TRND`,
    html: inviteEmailHtml(opts),
  });
}
