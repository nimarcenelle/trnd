import { cleanEssay, docxText, isDocx, isPdf, MAX_ESSAY_FILE_BYTES } from "@/lib/essayodds/essay-file-core";
import { readCommonApp } from "@/lib/essayodds/commonapp";
import { pdfText } from "@/lib/essayodds/sat";
import { isEssayOpen } from "@/lib/env";

/** A Word or PDF essay in, its text out. Read in memory and dropped; nothing is saved here. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_ESSAY_FILE_BYTES) return Response.json({ error: "too_big" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    if (isPdf(bytes)) {
      text = await pdfText(bytes);
      // A whole Common App, not one essay: take the personal statement out of it.
      if (text.split(/\s+/).length > 1200) text = (await readCommonApp(bytes)).essay ?? "";
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
