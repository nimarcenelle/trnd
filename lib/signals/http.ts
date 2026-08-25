/**
 * Hardened fetch for signal adapters: 10s timeout, exponential-backoff retry
 * (max 3 attempts), and a per-adapter circuit breaker that disables the
 * adapter for the rest of the run after repeated failure. One dead source is
 * a logged warning, never a failed run.
 */

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export class CircuitBreaker {
  private failures = 0;
  private opened = false;

  constructor(
    readonly name: string,
    private readonly threshold = 3,
  ) {}

  get isOpen(): boolean {
    return this.opened;
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold && !this.opened) {
      this.opened = true;
      console.warn(`[signals:${this.name}] circuit open — adapter disabled for this run`);
    }
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FetchTextOptions {
  headers?: Record<string, string>;
  breaker?: CircuitBreaker;
  /** 4xx statuses are not retried (retrying a 403 policy denial is noise). */
  retryOn4xx?: boolean;
  method?: "GET" | "POST";
  body?: string;
}

export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  if (opts.breaker?.isOpen) {
    throw new Error(`circuit open for ${opts.breaker.name}`);
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: opts.headers,
        body: opts.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        const err = new HttpError(res.status, url);
        if (res.status >= 400 && res.status < 500 && !opts.retryOn4xx) {
          opts.breaker?.recordFailure();
          throw err;
        }
        throw err;
      }
      opts.breaker?.recordSuccess();
      return await res.text();
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && !opts.retryOn4xx) {
        break; // no retry on 4xx
      }
      opts.breaker?.recordFailure();
      if (opts.breaker?.isOpen || attempt === MAX_ATTEMPTS) break;
      await sleep(2 ** attempt * 500); // 1s, 2s
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, opts: FetchTextOptions = {}): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}
