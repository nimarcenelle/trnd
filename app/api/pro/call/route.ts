import { isPro, paidAccess } from "@/lib/essayodds/access";
import { currentSession } from "@/lib/essayodds/auth";
import { putLatest, recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { subscriberId } from "@/lib/essayodds/access";
import { env, isEmailConfigured, isEssayOpen } from "@/lib/env";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

async function send(to: string, subject: string, html: string, replyTo?: string) {
  if (!isEmailConfigured) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.essayOddsEmailFrom, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

/** A Pro buyer asks for their call: saved, sent to the team with the student as reply-to, and confirmed to the student. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const access = await paidAccess();
  if (!isPro(access)) return Response.json({ error: "pro_only" }, { status: 402 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const account = await currentSession();
  const call = { name: clip(body?.name, 80), email: clip(body?.email, 200) || account?.email || access?.email || "", times: clip(body?.times, 800), focus: clip(body?.focus, 1500), phone: clip(body?.phone, 40) };
  if (!call.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(call.email) || !call.times) return Response.json({ error: "fields" }, { status: 400 });
  // Demo mode shows the form working without sending anything.
  if (access?.id === "demo") return Response.json({ ok: true });
  const who = subscriberId(access!.id);
  if ((await subscriberUsedToday("use_call", who).catch(() => 0)) >= 3) return Response.json({ error: "limit" }, { status: 429 });
  await recordSubscriberUse("use_call", who);
  await putLatest("call_request", `call_request:${who}:${crypto.randomUUID()}`, { ...call, at: new Date().toISOString() });
  try {
    await send(
      env.essayOddsOwnerEmail,
      `Pro call request: ${call.name}`,
      `<div style="font-family:Inter,system-ui,sans-serif;color:#101b30;line-height:1.6"><h2 style="margin:0 0 12px">New Pro call request</h2>
<p><b>${esc(call.name)}</b> · ${esc(call.email)}${call.phone ? ` · ${esc(call.phone)}` : ""}</p>
<p><b>Times that work:</b><br>${esc(call.times).replace(/\n/g, "<br>")}</p>
<p><b>What to focus on:</b><br>${esc(call.focus || "Not given").replace(/\n/g, "<br>")}</p>
<p style="color:#68738a">Reply to this email to confirm a time with the student.</p></div>`,
      call.email,
    );
    await send(
      call.email,
      "We got your EssayOdds call request",
      `<div style="font-family:Inter,system-ui,sans-serif;color:#101b30;line-height:1.6;max-width:520px"><h2 style="margin:0 0 12px">Your call request is in</h2>
<p>Thanks, ${esc(call.name)}. One of us will email you within a day to confirm a 45-minute call from the times you gave.</p>
<p style="color:#68738a">Until then, keep working in your essays at essayodds.com.</p></div>`,
    );
  } catch (err) {
    console.error("[pro/call]", (err as Error).message);
  }
  return Response.json({ ok: true });
}
