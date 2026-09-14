import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-usage-"));

const { recordAiUsage, setUsageSink, summarizeUsage, withAiContext } = await import("../lib/ai/usage");
const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ai usage", () => {
  afterEach(() => setUsageSink(null));

  it("records a call's tokens against the job and brand that made it", async () => {
    const rows: unknown[] = [];
    setUsageSink(async (row) => {
      rows.push(row);
    });
    await withAiContext({ businessId: "biz-1", purpose: "week:picks" }, async () => {
      recordAiUsage("gemini-2.5-pro", { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 });
    });
    recordAiUsage("gemini-2.5-flash", { promptTokenCount: 10, candidatesTokenCount: 0 });
    recordAiUsage("gemini-2.5-flash", undefined);
    await tick();
    expect(rows).toEqual([
      { businessId: "biz-1", purpose: "week:picks", model: "gemini-2.5-pro", inputTokens: 1200, outputTokens: 300 },
      { businessId: null, purpose: "unknown", model: "gemini-2.5-flash", inputTokens: 10, outputTokens: 0 },
    ]);
  });

  it("never throws into the caller when the write fails", async () => {
    setUsageSink(async () => {
      throw new Error("db down");
    });
    expect(() => recordAiUsage("m", { promptTokenCount: 1 })).not.toThrow();
    await tick();
  });

  it("sums by purpose", () => {
    const s = summarizeUsage([
      { model: "m", purpose: "week:picks", input_tokens: 100, output_tokens: 50 },
      { model: "m", purpose: "week:picks", input_tokens: 100, output_tokens: 50 },
      { model: "m", purpose: "cron:rank", input_tokens: 10, output_tokens: 1 },
    ]);
    expect(s).toEqual({ calls: 3, inputTokens: 210, outputTokens: 101, byPurpose: { "week:picks": { calls: 2, tokens: 300 }, "cron:rank": { calls: 1, tokens: 11 } } });
  });

  it("is kept by the demo repo and read back by window", async () => {
    resetStore();
    const admin = createDemoRepo({ kind: "admin" });
    await admin.recordAiUsage({ business_id: null, purpose: "week:brief", model: "m", input_tokens: 5, output_tokens: 2 });
    expect((await admin.listAiUsage({ sinceHours: 1 })).map((u) => u.purpose)).toEqual(["week:brief"]);
  });
});
