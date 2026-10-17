import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";
import type { z } from "zod";

import { adminSupabase } from "@/lib/db/supabase";
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

/**
 * Spend control. A scan runs inside `withAiBudget`: every call it makes is
 * logged to ai_usage against the brand, and once the brand's daily token
 * budget is spent the next call throws instead of spending more.
 */
interface AiScope {
  brandId: string;
  remaining: number;
}
const scope = new AsyncLocalStorage<AiScope>();

export class AiBudgetExceeded extends Error {}

export function withAiBudget<T>(brandId: string, remaining: number, fn: () => Promise<T>): Promise<T> {
  return scope.run({ brandId, remaining }, fn);
}

/** Tokens a brand used in the last 24 hours (0 before 0110 has run). */
export async function tokensUsedToday(brandId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data, error } = await adminSupabase().from("ai_usage").select("input_tokens, output_tokens").eq("brand_id", brandId).gte("created_at", since).limit(5000);
  if (error) return 0;
  return (data ?? []).reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
}

function recordUsage(purpose: string, model: string, input: number, output: number) {
  const brandId = scope.getStore()?.brandId ?? null;
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return; // scripts run without a database
  void adminSupabase()
    .from("ai_usage")
    .insert({ brand_id: brandId, purpose, model, input_tokens: input, output_tokens: output })
    .then(({ error }) => error && console.warn("[ai] usage not saved:", error.message));
}

/** GPT-4-era models take a temperature; reasoning models take an effort instead. */
const isReasoning = (model: string) => !/^(gpt-4|gpt-3\.5|chatgpt-)/.test(model);

export async function generateJson<S extends z.ZodType>(opts: {
  /** What the call is for, in the usage log (report, tag_ads, ...). */
  purpose?: string;
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  const model = env.openaiModel;
  const format = { type: "json_schema" as const, name: "reply", strict: true, schema: strictJsonSchema(opts.schema) };
  let feedback = "";
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const budget = scope.getStore();
    if (budget && budget.remaining <= 0) throw new AiBudgetExceeded("This brand's daily AI budget is spent; the rest of the analysis runs on the next scan.");
    const prompt = safeText(feedback ? `${opts.prompt}\n\nYour previous reply was rejected: ${feedback}\nReturn corrected JSON.` : opts.prompt);
    const res = await getClient().responses.create({
      model,
      instructions: safeText(opts.system),
      input: prompt,
      text: { format },
      ...(isReasoning(model) ? { reasoning: { effort: opts.effort ?? "medium" } } : { temperature: 0.4 }),
    });
    const input = res.usage?.input_tokens ?? 0;
    const output = res.usage?.output_tokens ?? 0;
    if (budget) budget.remaining -= input + output;
    recordUsage(opts.purpose ?? "other", model, input, output);
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
