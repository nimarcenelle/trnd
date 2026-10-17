/**
 * Pulls from the outside world fail for passing reasons (a reset connection,
 * a 502, a slow host). One more try after a short pause turns most of those
 * into a good read. Failures that won't change on a retry (a 4xx, a login
 * wall) are the caller's to recognise: it throws `NoRetry` to stop early.
 */

export class NoRetry extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { tries?: number; delayMs?: number } = {}): Promise<T> {
  const tries = opts.tries ?? 2;
  let last: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      last = err;
      if (err instanceof NoRetry || attempt === tries) break;
      await sleep((opts.delayMs ?? 1500) * attempt);
    }
  }
  throw last;
}

/** A fetch that retries network errors and 5xx answers once. */
export async function fetchRetry(url: string, init: RequestInit & { timeoutMs?: number } = {}, tries = 2): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  return withRetry(async () => {
    const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs ?? 20_000) });
    if (res.status >= 500) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
    return res;
  }, { tries });
}
