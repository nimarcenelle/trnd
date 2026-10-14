import { adminSupabase } from "@/lib/db/supabase";
import type { Rival } from "@/lib/db/types";
import { env, isInboxConfigured } from "@/lib/env";
import { readWebhook, tokenFromRecipients } from "@/lib/inbox/parse";
import { storeInbound } from "@/lib/inbox/store";
import { verifyInbound } from "@/lib/inbox/verify";

/**
 * Competitors' marketing emails arrive here, one webhook per email, from
 * Resend's inbound mail (or any service posting the message as JSON). The
 * recipient address names the rival; the email is kept for the next scan's
 * report, and a double opt-in email gets its confirm link followed.
 */
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!isInboxConfigured) return new Response("inbox not configured", { status: 404 });
  const body = await req.text();
  if (!verifyInbound({ secret: env.inboundSecret, body, headers: req.headers, url: req.url })) return new Response("unauthorized", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("expected JSON", { status: 400 });
  }
  const read = readWebhook(payload);
  if (!read) return Response.json({ ignored: "not an email" });
  const { email, resendId } = read;

  // Resend's webhook carries the envelope only; the body is fetched by id.
  if (resendId && !email.text && !email.html && env.resendApiKey) {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(resendId)}`, {
      headers: { authorization: `Bearer ${env.resendApiKey}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res?.ok) {
      const full = (await res.json()) as { html?: string | null; text?: string | null; headers?: Record<string, string> };
      email.html = full.html ?? null;
      email.text = full.text ?? null;
      email.messageId = full.headers?.["message-id"] ?? email.messageId;
    }
  }

  const token = tokenFromRecipients(email.to, env.inboundDomain);
  if (!token) return Response.json({ ignored: "no rival address" });
  const sb = adminSupabase();
  const { data: rival } = await sb.from("rivals").select("id, brand_id, email_status").eq("inbox_token", token).maybeSingle<Pick<Rival, "id" | "brand_id" | "email_status">>();
  if (!rival) return Response.json({ ignored: "unknown address" });

  try {
    return Response.json(await storeInbound(sb, rival, email));
  } catch (err) {
    console.warn("[inbound]", (err as Error).message);
    return new Response("could not store", { status: 500 });
  }
}
