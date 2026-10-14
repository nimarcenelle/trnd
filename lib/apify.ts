/**
 * Apify is the paid backup reader. When it says the account can't pay (402)
 * or the token is refused (401/403), every later call in this scan would get
 * the same answer, so the first such answer switches Apify off for a while
 * and says why in words the owner can act on.
 */

import { NoRetry } from "@/lib/retry";

const PAUSE_MS = 15 * 60_000;
let down: { until: number; message: string } | null = null;

export class ApifyUnavailable extends NoRetry {}

export function apifyMessage(status: number): string {
  if (status === 402) return "Apify, the backup reader, is out of credit or over its monthly limit (402). Top it up or raise the limit at console.apify.com.";
  if (status === 401 || status === 403) return `Apify refused the token (${status}). Check APIFY_TOKEN in Vercel.`;
  return `Apify answered ${status}.`;
}

/** Throws when Apify was found unusable in the last few minutes. */
export function assertApifyUp(): void {
  if (down && Date.now() < down.until) throw new ApifyUnavailable(down.message);
}

/** Record an Apify answer; account-level refusals pause Apify and throw. */
export function noteApifyStatus(status: number): void {
  if (status === 401 || status === 402 || status === 403) {
    down = { until: Date.now() + PAUSE_MS, message: apifyMessage(status) };
    throw new ApifyUnavailable(down.message);
  }
}

export const apifyIsDown = () => Boolean(down && Date.now() < down.until);
