import { cleanEssay, docxText, isDocx, isPdf, MAX_ESSAY_FILE_BYTES } from "@/lib/essayodds/essay-file-core";
import { readCommonApp } from "@/lib/essayodds/commonapp";
import { pdfText } from "@/lib/essayodds/sat";
import { networkId } from "@/lib/essayodds/access";
import { countToday, recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { env, isEssayOpen } from "@/lib/env";

export const maxDuration = 60;

/** Files one network may send a day. Reading one costs CPU, and a long PDF costs a model call. */
const PER_DAY = 20;

/** A Word or PDF essay in, its text out. Read in memory and dropped; nothing is saved here. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_ESSAY_FILE_BYTES) return Response.json({ error: "too_big" }, { status: 413 });
  const user = networkId(request);
  if ((await subscriberUsedToday("use_essay_file", user).catch(() => 0)) >= PER_DAY) return Response.json({ error: "limit" }, { status: 429 });
  await recordSubscriberUse("use_essay_file", user);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    if (isPdf(bytes)) {
      text = await pdfText(bytes.slice());
      // A whole Common App, not one essay: take the personal statement out of it.
      // That takes the model, so it stops at the day's cap for unpaid reads across all visitors.
      if (text.split(/\s+/).length > 1200) text = (await countToday("use_essay_file")) < env.freeDailyCap ? ((await readCommonApp(bytes.slice())).essay ?? "") : "";
    }
    else if (isDocx(bytes)) text = docxText(bytes);
    else return Response.json({ error: "type" }, { status: 415 });
  } catch (err) {
    console.error("[essay-file]", (err as Error).message);
  }
  const essay = cleanEssay(text);
  if (essay.split(/\s+/).filter(Boolean).length < 20) return Response.json({ error: "unreadable" }, { status: 422 });
  return Response.json({ essay });
}
