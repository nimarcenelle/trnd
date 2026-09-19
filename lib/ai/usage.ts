import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What every model call costs, by brand and by the job that made it.
 *
 * The product had no meter on its model calls: a brand's week is a brief,
 * a rival proposal, a fit judgment, five picks with three scripts each and
 * a copy chief, and nobody could say what that came to in tokens, let
 * alone which brand or which stage. The calls all go through one client
 * (lib/ai/openai.ts), which reports usage on every response; this file is
 * where that usage is tagged with who it was for and written down.
 *
 * The tag travels on async context, so the week job, the ranking cron and
 * the onboarding action set it once and every call underneath carries it.
 * Writing never throws and never waits: a meter that could fail a pick
 * would be worse than no meter.
 */

export interface AiContext {
  businessId: string | null;
  purpose: string;
}

const storage = new AsyncLocalStorage<AiContext>();

export function withAiContext<T>(ctx: AiContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentAiContext(): AiContext | null {
  return storage.getStore() ?? null;
}

/** The usage block as the OpenAI Responses API reports it (input_tokens,
 * output_tokens); the Gemini names are still read so older callers and
 * fixtures keep working. */
export interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/** Sink for tests; production writes through the admin repo. */
let sink: ((row: { businessId: string | null; purpose: string; model: string; inputTokens: number; outputTokens: number }) => Promise<void>) | null = null;

export function setUsageSink(fn: typeof sink): void {
  sink = fn;
}

/** Record one call's tokens against the current context. Fire and forget. */
export function recordAiUsage(model: string, usage: UsageMetadata | undefined | null): void {
  const input = Math.max(0, Math.round(usage?.input_tokens ?? usage?.promptTokenCount ?? 0));
  const output = Math.max(0, Math.round(usage?.output_tokens ?? usage?.candidatesTokenCount ?? 0));
  if (input === 0 && output === 0) return;
  const ctx = currentAiContext();
  const row = { businessId: ctx?.businessId ?? null, purpose: ctx?.purpose ?? "unknown", model, inputTokens: input, outputTokens: output };
  const write =
    sink ??
    (async () => {
      const { getAdminRepo } = await import("@/lib/db/admin");
      await getAdminRepo().recordAiUsage({
        business_id: row.businessId,
        purpose: row.purpose,
        model: row.model,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
      });
    });
  void Promise.resolve()
    .then(() => write(row))
    .catch((err: Error) => console.warn("[ai:usage] not recorded (non-fatal):", err.message));
}

/** Totals over a set of rows, for the health probe and the admin view. */
export function summarizeUsage(rows: { model: string; input_tokens: number; output_tokens: number; purpose: string }[]): {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  byPurpose: Record<string, { calls: number; tokens: number }>;
} {
  const byPurpose: Record<string, { calls: number; tokens: number }> = {};
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of rows) {
    inputTokens += r.input_tokens;
    outputTokens += r.output_tokens;
    const p = (byPurpose[r.purpose] ??= { calls: 0, tokens: 0 });
    p.calls += 1;
    p.tokens += r.input_tokens + r.output_tokens;
  }
  return { calls: rows.length, inputTokens, outputTokens, byPurpose };
}
