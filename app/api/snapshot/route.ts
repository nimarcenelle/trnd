import { randomBytes } from "node:crypto";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { notifyFounder } from "@/lib/notify";
import { buildDemandSnapshot, SNAPSHOT_FRESH_MS } from "@/lib/preview/build";
import { beginBuild, clientKey, endBuild, takeSlot } from "@/lib/preview/rate-limit";
import type { DemandSnapshot, SnapshotEvent } from "@/lib/preview/types";
import { guardPublicUrl } from "@/lib/preview/url-guard";

export const maxDuration = 120;

const encoder = new TextEncoder();
const line = (event: SnapshotEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

/** URL-safe, unguessable, short enough to read over the phone. */
const newToken = () => randomBytes(9).toString("base64url");

/**
 * The public demand snapshot: a website address in, a shareable page out,
 * no signup. Streams NDJSON so the wait shows findings as they land —
 * the crawl, the metro read, the demand deltas, who else is advertising —
 * because that narration is the most persuasive thing the product does.
 *
 * This is the only unauthenticated endpoint that makes outbound requests,
 * so it is the only one that guards the URL (SSRF), rate-limits the caller,
 * and reuses a recent snapshot rather than re-crawling someone's site.
 */
export async function POST(request: Request): Promise<Response> {
  let rawUrl = "";
  try {
    rawUrl = String(((await request.json()) as { url?: string }).url ?? "");
  } catch {
    /* handled by the guard below */
  }

  const guarded = await guardPublicUrl(
    /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`,
  );
  if (!guarded.ok) return json({ type: "error", reason: guarded.reason }, 400);

  const slot = takeSlot(clientKey(request.headers));
  if (!slot.ok) return json({ type: "error", reason: slot.reason }, 429);

  const repo = getAdminRepo();

  // Somebody already looked at this site today — hand back the same page
  // rather than crawling them again.
  try {
    const fresh = await repo.getFreshPublicSnapshotByHost(guarded.host, SNAPSHOT_FRESH_MS);
    if (fresh) {
      return new Response(
        line({ type: "done", token: fresh.token, snapshot: fresh.payload as DemandSnapshot }),
        { headers: ndjson },
      );
    }
  } catch (err) {
    console.warn("[snapshot] freshness lookup failed (non-fatal):", (err as Error).message);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SnapshotEvent) => {
        try {
          controller.enqueue(line(event));
        } catch {
          /* client hung up mid-build — the build finishes and is still stored */
        }
      };
      beginBuild();
      try {
        const built = await buildDemandSnapshot(guarded.url, send);
        if (!built.ok) {
          send({ type: "error", reason: built.reason });
          return;
        }
        const token = newToken();
        try {
          await repo.insertPublicSnapshot({
            token,
            host: guarded.host,
            url: guarded.url,
            business_name: built.snapshot.business.name,
            payload: built.snapshot,
          });
        } catch (err) {
          // A snapshot that can't be stored is still worth showing; the link
          // just won't outlive this response.
          console.warn("[snapshot] store failed (non-fatal):", (err as Error).message);
        }
        send({ type: "done", token, snapshot: built.snapshot });
        after(built.snapshot, token);
      } catch (err) {
        console.error("[snapshot] build failed:", (err as Error).message);
        send({ type: "error", reason: "Something broke while reading that site. Try again in a minute." });
      } finally {
        endBuild();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: ndjson });
}

const ndjson = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
} as const;

function json(event: SnapshotEvent, status: number): Response {
  return new Response(line(event), { status, headers: ndjson });
}

/** Every snapshot is a lead — the founder hears about it as it happens. */
function after(snapshot: DemandSnapshot, token: string): void {
  const base = env.siteUrl?.replace(/\/$/, "") ?? "";
  void notifyFounder({
    kind: "snapshot",
    businessName: snapshot.business.name,
    category: snapshot.business.category,
    city: snapshot.business.city,
    website: snapshot.business.website,
    link: `${base}/snapshot/${token}`,
  }).catch(() => {
    /* notification failure never affects the page */
  });
}
