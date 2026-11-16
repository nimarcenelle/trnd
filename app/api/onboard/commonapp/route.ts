import { networkId } from "@/lib/essayodds/access";
import { readCommonApp } from "@/lib/essayodds/commonapp";
import { MAX_PDF_BYTES } from "@/lib/essayodds/commonapp-core";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { isEssayOpen } from "@/lib/env";

export const maxDuration = 60;

const PER_DAY = 10;

/** A Common App PDF in, the odds flow's answers out. The file is read in memory and dropped. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: "too_big" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // "%PDF" at the start, whatever the browser says the type is.
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return Response.json({ error: "not_pdf" }, { status: 400 });
  const user = networkId(request);
  if ((await subscriberUsedToday("use_upload", user).catch(() => 0)) >= PER_DAY) return Response.json({ error: "limit" }, { status: 429 });
  try {
    const fields = await readCommonApp(bytes);
    await recordSubscriberUse("use_upload", user);
    return Response.json(fields);
  } catch (err) {
    console.error("[commonapp]", (err as Error).message);
    return Response.json({ error: "unreadable" }, { status: 422 });
  }
}
