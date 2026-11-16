import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Accounts are an email address, proven by a 6-digit code sent to it. No passwords. A session is a signed cookie that
 * holds the account id and email; nothing about it lives in the database, so logging out is clearing the cookie.
 */
export const SESSION_COOKIE = "essayodds_session";
export const SESSION_DAYS = 30;
export const CODE_MINUTES = 15;

export type Session = { uid: string; email: string; exp: number };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;

/** Stable and non-reversible: the same email is always the same account. */
export const accountId = (email: string) => createHash("sha256").update(`essayodds-account:${normalizeEmail(email)}`).digest("hex").slice(0, 24);

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const codeHash = (uid: string, code: string) => createHash("sha256").update(`essayodds-code:${uid}:${code.trim()}`).digest("hex");

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", `essayodds-session:${secret}`).update(body).digest("base64url");

export function signSession(s: Session, secret: string): string {
  const body = b64(JSON.stringify(s));
  return `${body}.${sign(body, secret)}`;
}

/** The session in a cookie value, or null if it was tampered with or has expired. */
export function verifySession(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    return typeof s.uid === "string" && typeof s.email === "string" && s.exp > now ? s : null;
  } catch {
    return null;
  }
}

/** Names of the saved work an account keeps. Anything else is refused. */
export const DATA_NAMES = ["essay-draft", "odds-answers", "lists", "final"] as const;
export type DataName = (typeof DATA_NAMES)[number];
export const isDataName = (name: unknown): name is DataName => typeof name === "string" && (DATA_NAMES as readonly string[]).includes(name);
export const MAX_DATA_BYTES = 200_000;
