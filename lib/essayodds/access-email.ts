import "server-only";

import { createHash } from "node:crypto";

import { env, isEmailConfigured } from "@/lib/env";

import { accessLink, type Access } from "./access";
import { deleteKeys, saveFirst } from "./saved";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });

/** The email that carries access links. Plain, so it lands in the inbox and reads on a phone. */
export async function sendAccessEmail(to: string, sessions: ({ id: string } & Access)[]): Promise<void> {
  if (!isEmailConfigured || !sessions.length) return;
  const rows = sessions
    .map((s) => {
      const url = accessLink(s.id, env.siteUrl);
      return `<p style="margin:0 0 16px"><a href="${esc(url)}" style="display:inline-block;background:#14233f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open EssayOdds</a><br><span style="font-size:13px;color:#68738a">${s.until ? `Access until ${day(s.until)}.` : "Access while your subscription is active."}</span></p>`;
    })
    .join("");
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#101b30">
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">Your EssayOdds access link</h1>
<p style="line-height:1.6;margin:0 0 20px">Open this on any device to get back to your essays. Keep this email: it's your way back in. If someone paid for you, forward it to the student.</p>
${rows}
<p style="font-size:13px;color:#68738a;line-height:1.6">Anyone with this link can use the access, so don't share it beyond the student. Didn't buy EssayOdds? You can ignore this email.</p>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.essayOddsEmailFrom, to: [to], subject: "Your EssayOdds access link", html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Sends the link once per purchase, the first time the purchase is seen as paid. */
export async function emailAccessOnce(session: { id: string } & Access): Promise<void> {
  if (!session.email) return;
  const key = "access_email:" + createHash("sha256").update(session.id).digest("hex").slice(0, 32);
  // The row is written before the send, so two tabs returning from checkout can't both send it.
  const before = Date.now();
  const saved = await saveFirst<{ at: number }>("access_email", [{ key, value: { at: before } }]);
  if (saved.get(key)?.at !== before) return;
  try {
    await sendAccessEmail(session.email, [session]);
  } catch (err) {
    // Not sent: clear the mark so the next return or Stripe's retry sends it.
    await deleteKeys([key]).catch(() => {});
    throw err;
  }
}
