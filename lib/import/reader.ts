import { env } from "@/lib/env";

/**
 * The reader proxy: a rendered read of a page that refuses a plain fetch.
 *
 * Cloudflare's managed challenge answers every non-browser request with a
 * 403 and "Just a moment...", browser user agent or not; Jolie's storefront
 * did, and onboarding told the owner to type their catalog in by hand. The
 * Playwright render in render.ts covers this on a laptop, but Vercel has no
 * browser. Jina's reader (r.jina.ai) renders the page in a real browser on
 * its side and hands back the HTML, or the raw text for a JSON endpoint,
 * and needs no key for light use (a key raises the rate limit).
 *
 * Only reached after the direct fetch was refused: the reader is slower and
 * rate-limited, and never the first choice.
 */

const READER_URL = "https://r.jina.ai/";
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 2_500_000;

export type ReaderFormat = "html" | "text";

/** HTTP statuses that mean "a bot was refused", not "the page is gone". */
export function isRefusal(err: unknown): boolean {
  return /HTTP (403|429|503)|bot protection|blocked/i.test(err instanceof Error ? err.message : String(err));
}

export async function fetchViaReader(
  url: string,
  format: ReaderFormat,
  opts: { fetchImpl?: typeof fetch; attempts?: number } = {},
): Promise<string> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await readOnce(url, format, opts.fetchImpl ?? fetch);
    } catch (err) {
      // The reader answers a burst with a refusal or an empty page; one more
      // try a moment later is usually the read.
      last = err;
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last;
}

async function readOnce(url: string, format: ReaderFormat, doFetch: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "x-return-format": format };
    if (env.jinaApiKey) headers.authorization = `Bearer ${env.jinaApiKey}`;
    const res = await doFetch(`${READER_URL}${url}`, { signal: controller.signal, headers, redirect: "follow" });
    if (!res.ok) throw new Error(`reader HTTP ${res.status}`);
    const text = (await res.text()).slice(0, MAX_BYTES);
    if (!text.trim()) throw new Error("reader returned nothing");
    return text;
  } finally {
    clearTimeout(t);
  }
}
