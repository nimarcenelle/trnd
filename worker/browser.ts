import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { graphqlBlocks, jsonBlocks, looksBlocked, parsePayloads, type ScrapedAd } from "../lib/adlibrary/parse";
import { UA } from "../lib/adlibrary/session";

/**
 * A real Chrome, driven by Playwright, behind a residential proxy: the read
 * Meta can't tell from a person. It loads the Ad Library page, keeps the
 * HTML's first page of ads, scrolls so the page asks its own GraphQL query
 * for more, and parses every answer with the same parser the app uses.
 *
 * One browser and one context (one cookie jar) are shared across reads, and
 * the context is replaced every 40 reads or as soon as a read is walled.
 */

export class Walled extends Error {}

/** "http://user:pass@host:port" → Playwright's proxy option. */
export function proxyFrom(url: string | undefined): { server: string; username?: string; password?: string } | undefined {
  if (!url) return undefined;
  const u = new URL(url);
  return {
    server: `${u.protocol}//${u.host}`,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
  };
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let readsOnContext = 0;

async function ctx(): Promise<BrowserContext> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      proxy: proxyFrom(process.env.PROXY_URL),
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    context = null;
  }
  if (!context || readsOnContext >= 40) {
    await context?.close().catch(() => {});
    context = await browser.newContext({
      userAgent: UA,
      locale: "en-US",
      timezoneId: "America/New_York",
      viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
    });
    await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
    readsOnContext = 0;
  }
  readsOnContext++;
  return context;
}

/** Start a fresh session: the next read gets new cookies (and, with a rotating proxy, a new address). */
export async function resetSession(): Promise<void> {
  await context?.close().catch(() => {});
  context = null;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close().catch(() => {});
  browser = null;
  context = null;
}

/** Read one Ad Library URL: up to `limit` ads, scrolling for more. */
export async function readLibrary(url: string, limit: number): Promise<{ ads: ScrapedAd[]; complete: boolean; count: number | null }> {
  const page = await (await ctx()).newPage();
  const answers: Promise<string>[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/graphql")) answers.push(r.text().catch(() => ""));
  });
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const html = res ? await res.text().catch(() => "") : "";
    if (!res || !res.ok() || looksBlocked(html) || page.url().includes("/login")) {
      await resetSession();
      throw new Walled(`Ad Library answered ${res?.status() ?? "nothing"}${looksBlocked(html) ? " with a login wall" : ""}`);
    }
    const first = parsePayloads(jsonBlocks(html));
    const ads = new Map(first.ads.map((a) => [a.archiveId, a]));
    let hasNext = first.hasNext;
    let count = first.count;

    // Scroll until we have enough, the page says there's no more, or two scrolls bring nothing.
    let idle = 0;
    for (let round = 0; round < 15 && hasNext && ads.size < limit && idle < 2; round++) {
      await page.mouse.wheel(0, 6000);
      await page.waitForTimeout(1500 + Math.random() * 1000);
      const texts = await Promise.all(answers.splice(0));
      const before = ads.size;
      for (const t of texts) {
        const more = parsePayloads(graphqlBlocks(t));
        for (const a of more.ads) ads.set(a.archiveId, a);
        if (more.ads.length || more.cursor) hasNext = more.hasNext;
        count ??= more.count;
      }
      idle = ads.size === before ? idle + 1 : 0;
    }
    if (!ads.size && count === null) {
      await resetSession();
      throw new Walled("Ad Library page carried no results we could read");
    }
    const list = [...ads.values()].slice(0, limit);
    return { ads: list, complete: !hasNext || (count !== null && list.length >= count), count };
  } finally {
    await page.close().catch(() => {});
  }
}

/** A page's HTML as the browser received it (Facebook Page lookups, public profiles). */
export async function fetchHtml(url: string): Promise<{ status: number; url: string; html: string }> {
  const page = await (await ctx()).newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return { status: res?.status() ?? 0, url: page.url(), html: res ? await res.text().catch(() => "") : "" };
  } finally {
    await page.close().catch(() => {});
  }
}
