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

  let body: { location?: string; radiusMiles?: number; categories?: string[]; cap?: number; onlyNoAds?: boolean };
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
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runProspectPipeline(params, send);
      } catch (err) {
        send({ type: "error", reason: err instanceof Error ? err.message : "Pipeline failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
