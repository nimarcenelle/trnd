import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Rival } from "@/lib/db/types";
import { env, isInboxConfigured } from "@/lib/env";

import { confirmLink, emailLinks, emailText, inboxAddress, newToken, type InboundEmail } from "./parse";
import { autoSubscribe } from "./subscribe";

/** The rival's inbound address, minting its token the first time. Null when the inbox isn't configured. */
export async function ensureInbox(sb: SupabaseClient, rival: Rival): Promise<string | null> {
  if (!isInboxConfigured) return null;
  if (!rival.inbox_token) {
    const token = newToken();
    const { error } = await sb.from("rivals").update({ inbox_token: token }).eq("id", rival.id).is("inbox_token", null);
    if (error) return null; // the column isn't there yet (0103 not run)
    const { data } = await sb.from("rivals").select("inbox_token").eq("id", rival.id).single<{ inbox_token: string | null }>();
    rival.inbox_token = data?.inbox_token ?? token;
  }
  return inboxAddress(rival.name, rival.inbox_token, env.inboundDomain);
}

/** Sign the rival's inbox up to its newsletter, once. */
export async function subscribeOnce(sb: SupabaseClient, rival: Rival): Promise<void> {
  if (rival.is_self || rival.email_status || !rival.website) return;
  const address = await ensureInbox(sb, rival);
  if (!address) return;
  const result = await autoSubscribe(rival.website, address);
  const status = result.ok ? "subscribed" : "manual";
  rival.email_status = status;
  rival.email_note = result.note;
  await sb.from("rivals").update({ email_status: status, email_note: result.note }).eq("id", rival.id);
}

/**
 * Keep one inbound email for the rival it was addressed to. A "confirm your
 * subscription" email gets its link followed, which is how a person would
 * finish signing up.
 */
export async function storeInbound(sb: SupabaseClient, rival: Pick<Rival, "id" | "brand_id" | "email_status">, email: InboundEmail): Promise<{ stored: boolean; confirmed: boolean }> {
  const text = email.text?.trim() || (email.html ? emailText(email.html) : "");
  const links = email.html ? emailLinks(email.html) : [];
  const confirm = confirmLink({ subject: email.subject, text, links });
  const receivedAt = email.date && !Number.isNaN(Date.parse(email.date)) ? new Date(email.date).toISOString() : new Date().toISOString();
  const { error } = await sb.from("emails").upsert(
    {
      brand_id: rival.brand_id,
      rival_id: rival.id,
      message_id: email.messageId,
      from_address: email.from,
      from_name: email.fromName,
      subject: email.subject.slice(0, 300),
      preview: text.slice(0, 280),
      body: text.slice(0, 8000),
      links,
      received_at: receivedAt,
      kind: confirm ? "confirmation" : null,
    },
    { onConflict: "rival_id,message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  let confirmed = false;
  if (confirm) {
    const res = await fetch(confirm, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Mozilla/5.0 (Macintosh) TRND" } }).catch(() => null);
    confirmed = Boolean(res?.ok);
  }
  if (rival.email_status !== "receiving") await sb.from("rivals").update({ email_status: "receiving", email_note: null }).eq("id", rival.id);
  return { stored: true, confirmed };
}
