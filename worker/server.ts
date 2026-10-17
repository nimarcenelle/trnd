import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { libraryUrl, type Facet, type Search } from "../lib/adlibrary/scrape";
import { registerLocalReader } from "../lib/adlibrary/worker";
import { captureError } from "../lib/errors";

import { closeBrowser, fetchHtml, readLibrary, Walled } from "./browser";
import { scanStats, startScanLoop } from "./scans";

/**
 * TRND's scraper worker: a small always-on service (Railway, Fly, Render) that
 * reads the Ad Library and public pages with a real browser behind a
 * residential proxy, so the app on Vercel never meets Meta's wall itself.
 *
 *   POST /scrape { search: { pageId } | { query }, limit }  → { ads, complete, via: "worker" }
 *   POST /fetch  { url }                                     → { status, url, html } (Facebook, Instagram, TikTok only)
 *   GET  /health                                             → counters, no auth
 *
 * With SCAN_QUEUE=1 and the app's environment, it also runs the scans
 * themselves off the queue (worker/scans.ts), reading through its own browser.
 *
 * Every POST needs `authorization: Bearer <SCRAPER_KEY>`. Reads run at most
 * WORKER_CONCURRENCY (3) at a time; the rest wait their turn.
 */

const PORT = Number(process.env.PORT) || 8080;
const KEY = process.env.SCRAPER_KEY ?? "";
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 3);
const FETCH_HOSTS = /(^|\.)(facebook\.com|instagram\.com|tiktok\.com)$/i;

const stats = { started: new Date().toISOString(), reads: 0, succeeded: 0, walled: 0, failed: 0, lastOkAt: null as string | null, lastError: null as string | null };

let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

function searchFrom(v: unknown): Search | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  // Stopped ads (for history) and one slice of the results are part of the search, not extras to drop.
  const status = o.status === "inactive" ? ("inactive" as const) : undefined;
  const f = o.facet && typeof o.facet === "object" ? (o.facet as Record<string, unknown>) : null;
  const facet: Facet | undefined = f
    ? {
        ...(f.media === "image" || f.media === "video" || f.media === "meme" ? { media: f.media as NonNullable<Facet["media"]> } : {}),
        ...(f.platform === "facebook" || f.platform === "instagram" ? { platform: f.platform as NonNullable<Facet["platform"]> } : {}),
      }
    : undefined;
  const extra = { ...(status ? { status } : {}), ...(facet && Object.keys(facet).length ? { facet } : {}) };
  if (typeof o.pageId === "string" && /^\d{3,25}$/.test(o.pageId)) return { pageId: o.pageId, ...extra };
  if (typeof o.query === "string" && o.query.trim() && o.query.length <= 120) return { query: o.query.trim(), ...extra };
  return null;
}

/** Read with one retry on a fresh session: the wall is often a bad cookie or a bad exit address. */
async function scrape(search: Search, limit: number) {
  stats.reads++;
  for (let attempt = 1; ; attempt++) {
    try {
      const read = await slot(() => readLibrary(libraryUrl(search), limit));
      stats.succeeded++;
      stats.lastOkAt = new Date().toISOString();
      return read;
    } catch (err) {
      if (err instanceof Walled && attempt < 2) continue;
      if (err instanceof Walled) stats.walled++;
      else stats.failed++;
      stats.lastError = (err as Error).message;
      throw err;
    }
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://worker").pathname;
  if (req.method === "GET" && path === "/health")
    return send(res, 200, { ok: true, running, waiting: waiting.length, proxy: Boolean(process.env.PROXY_URL), scans: scanLoop ? scanStats : "off", ...stats });
  if (req.method !== "POST") return send(res, 404, { error: "not found" });
  if (!KEY || req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, { error: "unauthorized" });
  const input = await body(req);
  try {
    if (path === "/scrape") {
      const search = searchFrom(input.search);
      if (!search) return send(res, 400, { error: "search must be { pageId } or { query }" });
      const limit = Math.min(200, Math.max(1, Number(input.limit) || 50));
      const read = await scrape(search, limit);
      return send(res, 200, { ads: read.ads, complete: read.complete, via: "worker" });
    }
    if (path === "/fetch") {
      const url = typeof input.url === "string" ? input.url : "";
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        // checked below
      }
      if (!FETCH_HOSTS.test(host)) return send(res, 400, { error: "only facebook.com, instagram.com and tiktok.com" });
      return send(res, 200, await slot(() => fetchHtml(url)));
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, err instanceof Walled ? 502 : 500, { error: (err as Error).message, walled: err instanceof Walled });
  }
});

// Scans running in this process read through this browser directly.
registerLocalReader({ scrape: (search, limit) => scrape(search, limit), fetch: (url) => slot(() => fetchHtml(url)) });
const scanLoop = startScanLoop();

process.on("unhandledRejection", (err) => void captureError(err, { where: "worker-unhandled" }));
server.listen(PORT, () => console.log(`[worker] listening on ${PORT}${process.env.PROXY_URL ? " via proxy" : " WITHOUT a proxy"}`));
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close();
    void closeBrowser().then(() => process.exit(0));
  });
}
