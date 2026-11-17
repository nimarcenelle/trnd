import "server-only";

import OpenAI from "openai";
import type { z } from "zod";

import { env } from "@/lib/env";
import { safeText } from "@/lib/format";

import { strictJsonSchema } from "./json-schema";

/**
 * The only file that imports the OpenAI SDK. One call shape: a prompt in,
 * JSON out, held to a Zod schema both by OpenAI's structured output and by
 * our own parse. A reply that fails the parse is asked for once more.
 */

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: env.openaiApiKey, timeout: 180_000, maxRetries: 2 });
  return client;
}

/** GPT-4-era models take a temperature; reasoning models take an effort instead. */
const isReasoning = (model: string) => !/^(gpt-4|gpt-3\.5|chatgpt-)/.test(model);

export async function generateJson<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  model?: string;
}): Promise<z.infer<S>> {
  const model = opts.model ?? env.openaiModel;
  const format = { type: "json_schema" as const, name: "reply", strict: true, schema: strictJsonSchema(opts.schema) };
  let feedback = "";
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = safeText(feedback ? `${opts.prompt}\n\nYour previous reply was rejected: ${feedback}\nReturn corrected JSON.` : opts.prompt);
    const res = await getClient().responses.create({
      model,
      instructions: safeText(opts.system),
      input: prompt,
      text: { format },
      ...(isReasoning(model) ? { reasoning: { effort: opts.effort ?? "medium" } } : { temperature: 0.4 }),
    });
    try {
      return opts.schema.parse(JSON.parse(res.output_text || "")) as z.infer<S>;
    } catch (err) {
      lastError = err;
      feedback = (err as Error).message.slice(0, 500);
      console.warn(`[ai] reply rejected (attempt ${attempt + 1}):`, feedback);
    }
  }
  throw lastError;
}

/**
 * generateJson, streamed: `onText` gets the reply so far each time more of it arrives, for showing work as it is written.
 * The finished reply is held to the schema the same way; one that fails is asked for again without streaming.
 */
export async function streamJson<S extends z.ZodType>(
  opts: { system: string; prompt: string; schema: S; effort?: "low" | "medium" | "high"; model?: string },
  onText: (soFar: string) => void,
): Promise<z.infer<S>> {
  const model = opts.model ?? env.openaiModel;
  const format = { type: "json_schema" as const, name: "reply", strict: true, schema: strictJsonSchema(opts.schema) };
  const stream = await getClient().responses.create({
    model,
    instructions: safeText(opts.system),
    input: safeText(opts.prompt),
    text: { format },
    stream: true,
    ...(isReasoning(model) ? { reasoning: { effort: opts.effort ?? "medium" } } : { temperature: 0.4 }),
  });
  let text = "";
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      text += event.delta;
      onText(text);
    }
  }
  try {
    return opts.schema.parse(JSON.parse(text)) as z.infer<S>;
  } catch (err) {
    console.warn("[ai] streamed reply rejected, asking again:", (err as Error).message.slice(0, 200));
    return generateJson(opts);
  }
}
