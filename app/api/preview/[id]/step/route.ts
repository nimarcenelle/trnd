import { runStep } from "@/lib/preview/run";

/** Runs the free preview's next step; the preview page calls it until the preview is ready. */
export const maxDuration = 300;

export async function POST(_req: Request, { params }: RouteContext<"/api/preview/[id]/step">): Promise<Response> {
  const { id } = await params;
  const p = await runStep(id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ status: p.status });
}
