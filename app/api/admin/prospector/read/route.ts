import { getAdminUser } from "@/lib/auth/admin";
import { getAdminRepo } from "@/lib/db/admin";
import { runAccountRead } from "@/lib/prospect/teardown";

export const maxDuration = 300;

/**
 * Admin-only. Streams the free account read of one prospect's site as
 * NDJSON status lines, then the teardown email. Everything it reads lands
 * on a prospect shadow brand the admin owns.
 */
export async function POST(req: Request): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ type: "error", reason: "Not authorized." }, { status: 404 });
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
  const website = String(body.website ?? "").trim();
  if (!website) return Response.json({ type: "error", reason: "Give a website." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const teardown = await runAccountRead(getAdminRepo(), { website, ownerId: admin.id }, { onStatus: (label) => send({ type: "status", label }) });
        send({ type: "done", businessId: teardown.businessId, brand: teardown.brand, subject: teardown.subject, body: teardown.body });
      } catch (err) {
        send({ type: "error", reason: err instanceof Error ? err.message : "The read failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
