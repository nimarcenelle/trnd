import { sendEmail } from "@/lib/email/send";
import { env, isEmailConfigured } from "@/lib/env";

import { getLeads, markSent } from "./store";
import { bodyToHtml, renderTemplate } from "./template";
import type { ProspectLead } from "./types";

/**
 * Sends the queued outreach — one real email per lead, personalized, from
 * the founder. Hard limits on purpose: a modest per-run cap, sequential
 * sends, and only leads the operator explicitly queued with a deliverable
 * address. Opted-out and already-sent leads are never re-mailed.
 */

const MAX_SENDS_PER_RUN = 25;

export interface SendResult {
  sent: { placeId: string; email: string }[];
  skipped: { placeId: string; reason: string }[];
}

function sendable(lead: ProspectLead): string | null {
  if (lead.status === "opted_out") return "opted out";
  if (lead.status === "sent") return "already sent";
  if (lead.status !== "queued") return "not queued";
  if (!lead.bestEmail || lead.emailStatus === "none") return "no deliverable email";
  return null;
}

export async function sendOutreach(
  placeIds: string[],
  subjectTemplate: string,
  bodyTemplate: string,
): Promise<SendResult> {
  if (!isEmailConfigured) {
    throw new Error("RESEND_API_KEY is not set — outreach sending is unavailable");
  }
  const leads = await getLeads(placeIds.slice(0, MAX_SENDS_PER_RUN));
  const result: SendResult = { sent: [], skipped: [] };
  for (const lead of leads) {
    const blocked = sendable(lead);
    if (blocked) {
      result.skipped.push({ placeId: lead.placeId, reason: blocked });
      continue;
    }
    const subject = renderTemplate(subjectTemplate, lead).slice(0, 150);
    const body = renderTemplate(bodyTemplate, lead);
    const res = await sendEmail({
      to: lead.bestEmail as string,
      subject,
      html: bodyToHtml(body),
      from: env.outreachFrom,
      replyTo: env.outreachFrom,
    });
    if (res.ok && !res.skipped) {
      await markSent(lead.placeId, subject);
      result.sent.push({ placeId: lead.placeId, email: lead.bestEmail as string });
    } else {
      result.skipped.push({ placeId: lead.placeId, reason: "send failed" });
    }
  }
  return result;
}
