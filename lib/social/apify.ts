import { env } from "@/lib/env";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";

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
 * Every call is money — actors bill per result — so this runner holds the
 * ceiling rather than trusting each caller to remember one.
 */

const RUN_URL = "https://api.apify.com/v2/acts";

/**
 * The most results any single actor run may bill for.
 *
 * Cost of goods is per result, and at $250 a brand a month the social read
 * has a budget measured in tens of items per account per run, not hundreds.
 * Forty is above every caller's own request (TikTok asks 30, Facebook 30)
 * and above what `readAccount` needs to compute a four-week cadence, so it
 * never cuts a normal read; it exists so a caller that forgets a limit, or
 * an actor that ignores the one it was given, cannot bill a whole profile
 * history against one brand's margin.
 */
export const MAX_RESULTS_PER_RUN = 40;

/**
 * Input keys the actors in use spell their result cap with. The runner only
 * ever lowers one of these — it never adds a key that was not there, because
 * Apify actors validate input against their own schema and a run rejected
 * for an unknown property is a paid failure that returns nothing.
 */
const LIMIT_KEYS = ["resultsLimit", "resultsPerPage", "maxItems", "maxResults", "count", "limit"] as const;

/**
 * Per-process spend ledger. No table and no migration: the point is that a
 * runaway shows up in the logs of the run that caused it, next to the
 * warning that truncated it, instead of only on next month's invoice.
 *
 * `runs` counts calls made from here, and every run is made with one attempt
 * and a budget long enough to finish (RUN_TIMEOUT_MS below), so this number
 * is what Apify bills rather than a floor under it.
 */
const tally = { runs: 0, results: 0, truncated: 0 };

/**
 * A synchronous actor run is billed per run and routinely takes longer than
 * the 10s default, so the default retry bills the same work two more times
 * for nothing. One attempt, and long enough to actually finish.
 */
const RUN_TIMEOUT_MS = 120_000;
const RUN_ATTEMPTS = 1;

export interface ApifyUsage {
  /** Actor runs started in this process. */
  runs: number;
  /** Results kept — what the callers actually saw. */
  results: number;
  /** Runs whose dataset came back over MAX_RESULTS_PER_RUN. */
  truncated: number;
}

/** What this process has spent on Apify so far. */
export function apifyUsage(): ApifyUsage {
  return { ...tally };
}

/** Tests and long-lived workers reset between runs; nothing else should. */
export function resetApifyUsage(): void {
  tally.runs = 0;
  tally.results = 0;
  tally.truncated = 0;
}

/** Apify addresses actors as `owner~name` in the path. Docs and the store
 * write `owner/name`; accept both so an env override in either spelling
 * still resolves. */
export function actorPath(actor: string): string {
  return encodeURIComponent(actor.trim().replace("/", "~"));
}

/**
 * Lower any result cap the caller already named to the ceiling, leaving the
 * rest of the input untouched. A caller asking for fewer keeps its own
 * number — this is a maximum, not a quota to spend.
 */
export function capActorInput(input: object, max: number = MAX_RESULTS_PER_RUN): object {
  const out = { ...(input as Record<string, unknown>) };
  for (const key of LIMIT_KEYS) {
    const asked = out[key];
    if (typeof asked === "number" && Number.isFinite(asked) && asked > max) out[key] = max;
  }
  return out;
}

export interface RunActorOptions {
  breaker?: CircuitBreaker;
  fetchText?: typeof fetchText;
  /** Lower than MAX_RESULTS_PER_RUN for a caller that needs less; never
   * higher — the ceiling wins. */
  maxResults?: number;
}

export async function runActorSync<T>(
  actor: string,
  input: object,
  opts: RunActorOptions = {},
): Promise<T[]> {
  // No key, no run: the social read is optional, and callers already treat
  // an empty list as "nothing to show".
  if (!env.apifyToken) return [];
  const max = Math.max(1, Math.min(opts.maxResults ?? MAX_RESULTS_PER_RUN, MAX_RESULTS_PER_RUN));
  const doFetchText = opts.fetchText ?? fetchText;
  tally.runs += 1;
  const text = await doFetchText(
    `${RUN_URL}/${actorPath(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capActorInput(input, max)),
      breaker: opts.breaker,
      timeoutMs: RUN_TIMEOUT_MS,
      maxAttempts: RUN_ATTEMPTS,
    },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // An HTML error page or a truncated body is "no items", not a crash.
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  // Actors ignore limits they do not recognise, and a few page past the one
  // they do. The billed count is already spent by the time the dataset lands,
  // so the truncation is what turns it into a visible event rather than a
  // silent line on the invoice.
  if (parsed.length > max) {
    tally.truncated += 1;
    console.warn(
      `[apify] ${actor} returned ${parsed.length} results over the ${max} ceiling — keeping ${max}` +
        ` (this process: ${tally.runs} run${tally.runs === 1 ? "" : "s"}, ${tally.results + max} results)`,
    );
  }
  const kept = (parsed as T[]).slice(0, max);
  tally.results += kept.length;
  return kept;
}
