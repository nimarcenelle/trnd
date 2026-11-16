import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { COMMONAPP_SYSTEM, CommonAppReply, fieldsFrom, type CommonAppFields } from "./commonapp-core";

/** Reads the PDF in memory. Nothing from it is stored: not the file, not its text. */
export async function readCommonApp(bytes: Uint8Array): Promise<CommonAppFields> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const body = String(text).slice(0, 60000);
  if (body.trim().length < 200) throw new Error("No text in this PDF");
  const reply = await generateJson({ model: env.openaiModelFast, effort: "low", system: COMMONAPP_SYSTEM, prompt: `Common App PDF text:\n\n${body}`, schema: CommonAppReply });
  return fieldsFrom(body, reply);
}
