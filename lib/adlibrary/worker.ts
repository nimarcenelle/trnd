import { env, isWorkerConfigured } from "@/lib/env";

import type { ScrapedAd } from "./parse";

/**
 * The app's side of TRND's scraper worker (worker/server.ts): the read that
 * goes through a real browser and a residential proxy, so Meta doesn't wall
 * it the way it walls Vercel.
 */

export class WorkerError extends Error {
  constructor(
    message: string,
    readonly walled = false,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!isWorkerConfigured) throw new WorkerError("The scraper worker isn't configured (SCRAPER_URL, SCRAPER_KEY).");
  let res: Response;
  try {
    res = await fetch(`${env.scraperUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.scraperKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    throw new WorkerError(`The scraper worker didn't answer: ${(err as Error).message}`);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; walled?: boolean };
  if (res.status === 401) throw new WorkerError("The scraper worker refused our key: SCRAPER_KEY must match on Vercel and the worker.");
  if (!res.ok) throw new WorkerError(`Scraper worker: ${data.error ?? `answered ${res.status}`}`, Boolean(data.walled));
  return data as T;
}

export function fromWorker(search: { pageId: string } | { query: string }, limit: number): Promise<{ ads: ScrapedAd[]; complete: boolean }> {
  return call("/scrape", { search, limit }, 150_000);
}

/** A Facebook, Instagram or TikTok page's HTML, fetched by the worker's browser. */
export async function workerFetch(url: string): Promise<string | null> {
  if (!isWorkerConfigured) return null;
  const r = await call<{ status: number; html: string }>("/fetch", { url }, 60_000).catch(() => null);
  return r && r.status < 400 ? r.html : null;
}
