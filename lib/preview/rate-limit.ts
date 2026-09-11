/**
 * A small in-memory limiter for the one unauthenticated, outbound-fetching
 * endpoint in the product. Per-instance by design: serverless spreads
 * requests across instances, so this is a brake on a single abusive client,
 * not a global quota. The real brakes are elsewhere and cheaper — a repeat
 * ask for a host reuses the snapshot instead of re-crawling, and the build
 * itself is wall-clock budgeted.
 */

const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 8;
/** Two site crawls at once per instance; the rest wait their turn or bounce. */
const MAX_CONCURRENT = 2;

const hits = new Map<string, number[]>();
let inFlight = 0;

export type RateVerdict = { ok: true } | { ok: false; reason: string };

export function takeSlot(key: string): RateVerdict {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return { ok: false, reason: "That's a lot of snapshots from one place — try again in a bit." };
  }
  if (inFlight >= MAX_CONCURRENT) {
    return { ok: false, reason: "We're reading a couple of sites right now — try again in a moment." };
  }
  recent.push(now);
  hits.set(key, recent);
  // Old keys would otherwise accumulate for the life of the instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return { ok: true };
}

export function beginBuild(): void {
  inFlight += 1;
}
export function endBuild(): void {
  inFlight = Math.max(0, inFlight - 1);
}

/** Best-effort client identity behind a proxy — only ever used as a key. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
