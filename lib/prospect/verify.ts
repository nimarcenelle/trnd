import { resolve4, resolveMx } from "node:dns/promises";

import type { EmailStatus } from "./types";

/**
 * Email deliverability check that works in serverless: DNS-level (MX, then A)
 * with a hard timeout. Port-25 SMTP verification is blocked on Vercel, so
 * "verified" here means "the domain can receive mail", not "this inbox
 * exists" — the UI copy says "verified" in that spirit.
 */

// Big consumer providers always have MX — skip the lookup entirely.
const FREEMAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|msn|proton|protonmail)\.com$|^ymail\.com$/i;

const DNS_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), DNS_TIMEOUT_MS)),
  ]);
}

const mxCache = new Map<string, EmailStatus>();

export async function verifyEmailDomain(email: string): Promise<EmailStatus> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "none";
  if (FREEMAIL.test(domain)) return "verified";
  const cached = mxCache.get(domain);
  if (cached) return cached;
  let status: EmailStatus;
  try {
    const mx = await withTimeout(resolveMx(domain));
    status = mx.length > 0 ? "verified" : "risky";
  } catch {
    try {
      const a = await withTimeout(resolve4(domain));
      // A record but no MX — mail might still route via the implicit A
      // fallback, but bounces are likely.
      status = a.length > 0 ? "risky" : "none";
    } catch {
      status = "none";
    }
  }
  mxCache.set(domain, status);
  return status;
}
