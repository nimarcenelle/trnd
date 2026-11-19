import { isPro, paidAccess, subscriberId } from "@/lib/essayodds/access";
import { EssayCapReached } from "@/lib/essayodds/review";
import { pdfText, satPlan } from "@/lib/essayodds/sat";
import { MAX_SAT_TEXT, parseTarget } from "@/lib/essayodds/sat-core";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 120;

/** A scored practice test (PDF or pasted text) in, an SAT plan out. Pro only. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const access = await paidAccess();
  if (!isPro(access) || access?.id === "demo") return Response.json({ error: "pro_only" }, { status: 402 });
  const who = subscriberId(access!.id);
  if ((await subscriberUsedToday("use_sat", who).catch(() => 0)) >= 10) return Response.json({ error: "limit" }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  let text = String(form?.get("text") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return Response.json({ error: "too_big" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return Response.json({ error: "not_pdf" }, { status: 400 });
    text = await pdfText(bytes).catch(() => "");
  }
  text = text.trim().slice(0, MAX_SAT_TEXT);
  if (text.length < 80) return Response.json({ error: "empty" }, { status: 400 });
  try {
    const plan = await satPlan(text, parseTarget(form?.get("target")));
    await recordSubscriberUse("use_sat", who);
    return Response.json(plan);
  } catch (err) {
    if (err instanceof EssayCapReached) return Response.json({ error: "busy" }, { status: 503 });
    console.error("[sat]", (err as Error).message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
