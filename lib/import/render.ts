/**
 * Headless-browser fallback for sites the plain fetch can't read: WAFs that
 * 403 non-browser clients, and JS-rendered pages whose raw HTML is a husk.
 * Playwright is a devDependency and listed in serverExternalPackages — in
 * environments without it (serverless prod) getRenderer() returns null and
 * the import stays fetch-only. One browser serves the whole crawl; callers
 * must close() it.
 *
 * This is a single owner-initiated read of the owner's own site — the same
 * class of request as a link unfurler — so it presents as the real browser
 * it is: full Chromium in new-headless mode (not the easily fingerprinted
 * headless shell), a normal UA, and a short wait for JS challenges to clear.
 */

import { looksBlocked } from "./website";

const NAV_TIMEOUT_MS = 10_000;
const SETTLE_TIMEOUT_MS = 4_000;
const CHALLENGE_WAIT_MS = 5_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

export interface Renderer {
  render(url: string): Promise<string | null>;
  close(): Promise<void>;
}

export async function getRenderer(): Promise<Renderer | null> {
  try {
    const { chromium } = await import("playwright");
    // channel "chromium" = the full browser's new headless mode; its
    // fingerprint is real Chrome's. Fall back to the default headless shell
    // where the full build isn't installed.
    const browser = await chromium
      .launch({ headless: true, channel: "chromium" })
      .catch(() => chromium.launch({ headless: true }));
    return {
      async render(url: string) {
        let context;
        try {
          context = await browser.newContext({
            userAgent: UA,
            viewport: { width: 1366, height: 900 },
            locale: "en-US",
          });
          const page = await context.newPage();
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
          // Give client-rendered menus a moment; don't hang on chatty pages.
          await page.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
          let html = await page.content();
          // A JS challenge page (Cloudflare "Just a moment…") usually clears
          // itself once the browser proves it runs JavaScript — wait once.
          if (looksBlocked(html)) {
            await page.waitForTimeout(CHALLENGE_WAIT_MS);
            html = await page.content();
          }
          return html;
        } catch {
          return null;
        } finally {
          await context?.close().catch(() => {});
        }
      },
      async close() {
        await browser.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}