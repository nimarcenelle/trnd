import { brandDomain } from "@/lib/intel/discover-brands";
import { isReadLive, runCategoryRead, type ReadEvent } from "@/lib/read/run";

export const maxDuration = 300;

/**
 * Public. Streams the category read of one store as NDJSON: each stage the
 * moment it lands, then `done`. No account: this is the landing page's one
 * input.
 *
 * A live read costs one model call to name rivals, one to write the brief
 * and an Ad Library run per advertiser, so it is limited per visitor and a
 * finished read is replayed for the same domain for a day. Both live in
 * the instance's memory: best effort on serverless, which is the point of
 * keeping them small.
 */

const CACHE_MS = 24 * 3600_000;
const LIMIT_WINDOW_MS = 3600_000;
const LIMIT_PER_WINDOW = 5;

const cache = new Map<string, { at: number; events: ReadEvent[] }>();
const hits = new Map<string, number[]>();

function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

function overLimit(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < LIMIT_WINDOW_MS);
  if (recent.length >= LIMIT_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  hits.set(key, [...recent, now]);
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ type: "error", reason: "Bad origin." }, { status: 403 });
  }
  let body: { website?: string };
  try {
    body = (await req.json()) as { website?: string };
  } catch {
    return Response.json({ type: "error", reason: "Bad request body." }, { status: 400 });
  }
  const website = String(body.website ?? "").trim().slice(0, 300);
  if (!website) return Response.json({ type: "error", reason: "Paste your store's address." }, { status: 400 });

  const now = Date.now();
  const live = isReadLive();
  const domain = brandDomain(website);
  const cached = live && domain ? cache.get(domain) : undefined;
  const replay = cached && now - cached.at < CACHE_MS ? cached.events : null;
  if (!replay && live && overLimit(clientKey(req), now)) {
    return Response.json({ type: "error", reason: "That's a few reads in an hour. Try again later, or sign up to keep going." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReadEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        if (replay) {
          for (const e of replay) send(e);
          return;
        }
        const events: ReadEvent[] = [];
        await runCategoryRead(website, (e) => {
          events.push(e);
          send(e);
        });
        // Only a finished live read is worth replaying; an error or a read
        // whose ads all failed is tried fresh next time.
        const done = events.some((e) => e.type === "done");
        const readAds = events.some((e) => e.type === "advertiser");
        if (live && domain && done && readAds) cache.set(domain, { at: now, events: events.filter((e) => e.type !== "status") });
      } catch (err) {
        console.warn("[read] failed:", (err as Error).message);
        send({ type: "error", reason: "The read failed. Try again in a minute." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
