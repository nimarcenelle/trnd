import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { EssayCapReached } from "./review";
import { cleanSat, SAT_SYSTEM, satKey, satPrompt, SatReply, type SatPlan } from "./sat-core";
import { countToday, readSaved, saveFirst } from "./saved";

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  return String((await extractText(pdf, { mergePages: true })).text);
}

/** The same report and target always return the saved plan. */
export async function satPlan(text: string, target: number | null): Promise<SatPlan> {
  const key = satKey(text, target);
  const hit = (await readSaved<SatPlan>([key])).get(key);
  if (hit) return hit;
  if ((await countToday("sat")) >= env.rewriteDailyCap) throw new EssayCapReached();
  const reply = await generateJson({ model: env.openaiModelWriting, effort: "medium", system: SAT_SYSTEM, prompt: satPrompt(text, target), schema: SatReply });
  const value = cleanSat(reply, target);
  return (await saveFirst("sat", [{ key, value }])).get(key) ?? value;
}
