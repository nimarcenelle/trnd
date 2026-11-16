import "server-only";

import { cookies } from "next/headers";

import { env, isEmailConfigured } from "@/lib/env";

import { accountId, CODE_MINUTES, codeHash, newCode, normalizeEmail, SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type Session } from "./auth-core";
import { deleteKeys, latestByPrefix, readSaved, recordSubscriberUse, saveFirst, subscriberUsedToday } from "./saved";

const secret = () => env.essayEncryptionKey;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The signed-in account on this request, if any. */
export async function currentSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret());
}

export async function startSession(email: string): Promise<Session> {
  const s: Session = { uid: accountId(email), email: normalizeEmail(email), exp: Date.now() + SESSION_DAYS * 86_400_000 };
  (await cookies()).set(SESSION_COOKIE, signSession(s, secret()), { httpOnly: true, secure: env.siteUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
  return s;
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Per email and per network, a day: enough to retry, not enough to spam an inbox. */
const LIMITS = { codesPerEmail: 8, codesPerNetwork: 30, triesPerEmail: 20 };

export class TooMany extends Error {}

/** Emails a 6-digit code. Returns quietly for a capped email, so the reply never says who has an account. */
export async function sendLoginCode(rawEmail: string, network: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const uid = accountId(email);
  if ((await subscriberUsedToday("use_code", network)) >= LIMITS.codesPerNetwork) throw new TooMany();
  if ((await subscriberUsedToday("use_code", uid)) >= LIMITS.codesPerEmail) throw new TooMany();
  await recordSubscriberUse("use_code", network);
  await recordSubscriberUse("use_code", uid);
  const code = newCode();
  await saveFirst("login_code", [{ key: `login_code:${uid}:${crypto.randomUUID()}`, value: { hash: codeHash(uid, code), exp: Date.now() + CODE_MINUTES * 60_000 } }]);
  if (!isEmailConfigured) throw new Error("RESEND_API_KEY is not set");
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#101b30">
<h1 style="font-size:22px;margin:0 0 12px">Your EssayOdds sign-in code</h1>
<p style="font-size:36px;font-weight:700;letter-spacing:6px;margin:0 0 16px">${esc(code)}</p>
<p style="line-height:1.6;color:#45516a">Enter it on the sign-in page. It works for ${CODE_MINUTES} minutes. Didn't ask for it? Ignore this email.</p>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.essayOddsEmailFrom, to: [email], subject: `${code} is your EssayOdds code`, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

/** Checks a code against the newest ones sent to this email; a match signs in and spends every open code. */
export async function verifyLoginCode(rawEmail: string, code: string): Promise<Session | null> {
  const email = normalizeEmail(rawEmail);
  const uid = accountId(email);
  if ((await subscriberUsedToday("use_try", uid)) >= LIMITS.triesPerEmail) throw new TooMany();
  await recordSubscriberUse("use_try", uid);
  const codes = await latestByPrefix<{ hash: string; exp: number }>(`login_code:${uid}:`, 5);
  const hash = codeHash(uid, code);
  const hit = codes.find((c) => c.value.exp > Date.now() && c.value.hash === hash);
  if (!hit) return null;
  await deleteKeys(codes.map((c) => c.key));
  const key = `account:${uid}`;
  if (!(await readSaved([key])).has(key)) await saveFirst("account", [{ key, value: { email, createdAt: new Date().toISOString() } }]);
  return startSession(email);
}
