import { getAdminUser } from "@/lib/auth/admin";
import { isPlacesConfigured } from "@/lib/env";
import { runProspectPipeline } from "@/lib/prospect/pipeline";
import type { RunEvent } from "@/lib/prospect/types";

export const maxDuration = 300;

/**
 * Admin-only. Streams the prospecting pipeline as NDJSON RunEvents — same
 * shape of streaming as /api/import.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await getAdminUser())) {
    return Response.json({ type: "error", reason: "Not authorized." }, { status: 404 });
  }
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ type: "error", reason: "Bad origin." }, { status: 403 });
  }
  if (!isPlacesConfigured) {
    return Response.json(
      { type: "error", reason: "GOOGLE_PLACES_API_KEY is not set — discovery is unavailable." },
      { status: 503 },
    );
  }

  let body: {
    location?: string;
    radiusMiles?: number;
    categories?: string[];
    cap?: number;
    onlyNoAds?: boolean;
    onlyWithEmail?: boolean;
    onlyVerified?: boolean;
    skipChains?: boolean;
    minFit?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ type: "error", reason: "Bad request body." }, { status: 400 });
  }
  const location = String(body.location ?? "").trim();
  const categories = (body.categories ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 6);
  if (!location || categories.length === 0) {
    return Response.json({ type: "error", reason: "Location and at least one business type are required." }, { status: 400 });
  }
  const params = {
    location,
    categories,
    radiusMiles: Math.min(Math.max(Number(body.radiusMiles) || 25, 1), 100),
    cap: Math.min(Math.max(Number(body.cap) || 50, 1), 200),
    onlyNoAds: Boolean(body.onlyNoAds),
    onlyWithEmail: Boolean(body.onlyWithEmail),
    onlyVerified: Boolean(body.onlyVerified),
    skipChains: body.skipChains !== false,
    minFit: Math.min(Math.max(Number(body.minFit) || 0, 0), 100),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The client can vanish mid-run (tab closed, fetch aborted) — the
      // pipeline keeps finishing and saving, it just stops narrating.
      let closed = false;
      const send = (event: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await runProspectPipeline(params, send);
      } catch (err) {
        send({ type: "error", reason: err instanceof Error ? err.message : "Pipeline failed." });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already torn down by the disconnect */
          }
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
