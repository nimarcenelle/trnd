import { env } from "@/lib/env";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";
import { recordProviderUsage } from "@/lib/usage/providers";

/**
 * The one Apify call every social read makes.
 *
 * run-sync-get-dataset-items blocks until the actor finishes and returns the
 * dataset inline — no run polling, no dataset left behind to clean up. It is
 * the same call `lib/signals/adapters/tiktok-apify.ts` makes per term; it
 * lives here so the three account readers (Instagram, TikTok, Facebook)
 * share one URL shape, one breaker convention and one "not an array means
 * nothing" rule instead of drifting apart.
 *
 * Every call is money — actors bill per result — so callers cap results in
 * their input and never retry a whole account on their own.
 */

const RUN_URL = "https://api.apify.com/v2/acts";
/** An actor run's whole length. Apify's run-sync endpoint itself gives up
 * at five minutes; a scrape that long is a scrape that failed. */
export const ACTOR_TIMEOUT_MS = 180_000;
/** Never retried: a retry starts a second paid run of the same scrape. */
export const ACTOR_ATTEMPTS = 1;

export interface RunActorOptions {
  breaker?: CircuitBreaker;
  fetchText?: typeof fetchText;
}

/** Apify addresses actors as `owner~name` in the path. Docs and the store
 * write `owner/name`; accept both so an env override in either spelling
 * still resolves. */
export function actorPath(actor: string): string {
  return encodeURIComponent(actor.trim().replace("/", "~"));
}

export async function runActorSync<T>(
  actor: string,
  input: object,
  opts: RunActorOptions = {},
): Promise<T[]> {
  // No key, no run: the social read is optional, and callers already treat
  // an empty list as "nothing to show".
  if (!env.apifyToken) return [];
  const doFetchText = opts.fetchText ?? fetchText;
  let text: string;
  try {
    text = await doFetchText(
      `${RUN_URL}/${actorPath(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        breaker: opts.breaker,
        timeoutMs: ACTOR_TIMEOUT_MS,
        attempts: ACTOR_ATTEMPTS,
      },
    );
  } catch (err) {
    // A failed run is still a run on the bill, and the meter says it failed.
    recordProviderUsage({ provider: "apify", operation: actor, rateKey: "apify:run", units: 1, ok: false, note: (err as Error).message });
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // An HTML error page or a truncated body is "no items", not a crash.
    recordProviderUsage({ provider: "apify", operation: actor, rateKey: "apify:run", units: 1, ok: false, note: "answer was not JSON" });
    return [];
  }
  const items = Array.isArray(parsed) ? (parsed as T[]) : [];
  // Actors bill per result: the meter counts what came back.
  if (items.length > 0) recordProviderUsage({ provider: "apify", operation: actor, rateKey: "apify:result", units: items.length });
  else recordProviderUsage({ provider: "apify", operation: actor, rateKey: "apify:run", units: 1 });
  return items;
}
