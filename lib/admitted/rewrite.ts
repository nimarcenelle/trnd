import "server-only";

import { z } from "zod";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { keptShare, rewriteKey, wordCount } from "./rewrite-core";
import { countToday, readSaved, saveFirst } from "./saved";

export type Rewrite = { rewrite: string; changes: string[]; kept: number; words: number };

const Reply = z.object({ rewrite: z.string(), changes: z.array(z.string()) });

const SYSTEM = `You edit a student's college application essay, working from their own draft.
Use only facts, events, people and details that are in the draft. Never invent an experience, a number, a name or a feeling.
Keep the student's voice and as many of their sentences as you can. Change what costs them: a generic opening, weak structure, lines that could be anyone's.
Stay at or under the word limit in the prompt. "changes" lists up to five short sentence-case notes on what changed and why.`;

export class RewriteCapReached extends Error {}

/** The same draft, prompt and revision number always return the saved rewrite. */
export async function rewriteEssay(draft: string, prompt: string, revision: number): Promise<Rewrite> {
  const key = rewriteKey(draft, prompt, revision);
  const saved = await readSaved<Rewrite>([key]);
  const hit = saved.get(key);
  if (hit) return hit;
  if ((await countToday("rewrite")) >= env.rewriteDailyCap) throw new RewriteCapReached();
  const reply = await generateJson({ model: env.openaiModelWriting, effort: "high", system: SYSTEM, prompt: `Essay prompt: ${prompt || "Common App personal statement"}\nWord limit: 650\nRevision: ${revision}\n\nDraft:\n${draft}`, schema: Reply });
  const value: Rewrite = { rewrite: reply.rewrite.trim(), changes: reply.changes.slice(0, 5), kept: keptShare(draft, reply.rewrite), words: wordCount(reply.rewrite) };
  return (await saveFirst("rewrite", [{ key, value }])).get(key) ?? value;
}
