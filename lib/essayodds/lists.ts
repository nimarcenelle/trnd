import "server-only";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { buildListReview, ListReply, listKey, listPrompt, listSystem, type ListKind, type ListReview } from "./lists-core";
import { EssayCapReached } from "./review";
import { countToday, readSaved, saveFirst } from "./saved";

/** The same list always returns its saved review. */
export async function reviewList(kind: ListKind, text: string): Promise<ListReview> {
  const key = listKey(kind, text);
  const hit = (await readSaved<ListReview>([key])).get(key);
  if (hit) return hit;
  if ((await countToday("lists")) >= env.rewriteDailyCap) throw new EssayCapReached();
  const reply = await generateJson({ model: env.openaiModelWriting, effort: "medium", system: listSystem(kind), prompt: listPrompt(kind, text), schema: ListReply });
  const value = buildListReview(kind, text, reply);
  if (!value.entries.length) throw new Error("List review: no entry matched the pasted text");
  return (await saveFirst("lists", [{ key, value }])).get(key) ?? value;
}
