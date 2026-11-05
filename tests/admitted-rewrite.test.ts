import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ writes: [] as string[], scores: new Map<string, number>(), failSecond: false, checks: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { rewriteDailyCap: 200, openaiModelWriting: "m" } }));
vi.mock("@/lib/admitted/saved", () => ({
  readSaved: async () => new Map(),
  countToday: async () => 0,
  saveFirst: async (_: string, rows: { key: string; value: unknown }[]) => new Map(rows.map((r) => [r.key, r.value])),
}));
vi.mock("@/lib/admitted/review", () => ({
  EssayCapReached: class extends Error {},
  reviewEssay: async (essay: string) => ({ score: calls.scores.get(essay) ?? 58, notes: [], keep: [], grades: [], words: 1, limit: 650 }),
}));
vi.mock("@/lib/ai/openai", () => ({
  generateJson: async ({ prompt }: { prompt: string }) => {
    if (prompt.startsWith("Draft:")) {
      calls.checks.push(prompt);
      return { invented: [] };
    }
    calls.writes.push(prompt);
    if (calls.writes.length === 2 && calls.failSecond) throw new Error("model down");
    return { rewrite: `attempt${calls.writes.length} ${"word ".repeat(60)}`, changes: [] };
  },
}));

const draft = "word ".repeat(60).trim();
const text = (n: number) => `attempt${n} ${"word ".repeat(60)}`;

describe("rewriting", () => {
  beforeEach(() => {
    calls.writes = [];
    calls.checks = [];
    calls.scores = new Map([[draft, 58]]);
    calls.failSecond = false;
  });

  it("does not try again when the first rewrite holds its score", async () => {
    calls.scores.set(text(1), 58);
    const { rewriteEssay } = await import("@/lib/admitted/rewrite");
    expect((await rewriteEssay(draft, "", 650, 0)).after).toBe(58);
    expect(calls.writes).toHaveLength(1);
  });

  it("does not spend a second try on a drop within the usual wobble", async () => {
    calls.scores.set(text(1), 56);
    const { rewriteEssay } = await import("@/lib/admitted/rewrite");
    expect((await rewriteEssay(draft, "", 650, 0)).after).toBe(56);
    expect(calls.writes).toHaveLength(1);
  });

  it("tries once more when the rewrite scores lower, and keeps the better one", async () => {
    calls.scores.set(text(1), 50);
    calls.scores.set(text(2), 63);
    const { rewriteEssay } = await import("@/lib/admitted/rewrite");
    const result = await rewriteEssay(draft, "", 650, 0);
    expect(calls.writes).toHaveLength(2);
    expect(calls.writes[1]).toContain("scored 50, below the draft's 58");
    expect(result.after).toBe(63);
    expect(result.rewrite).toContain("attempt2");
  });

  it("stops at two tries and reports the better of two low scores", async () => {
    calls.scores.set(text(1), 50);
    calls.scores.set(text(2), 42);
    const { rewriteEssay } = await import("@/lib/admitted/rewrite");
    const result = await rewriteEssay(draft, "", 650, 0);
    expect(calls.writes).toHaveLength(2);
    expect(result.after).toBe(50);
  });

  it("gives the writer and the checker the student's details", async () => {
    calls.scores.set(text(1), 70);
    const { rewriteEssay } = await import("@/lib/admitted/rewrite");
    const result = await rewriteEssay(draft, "", 650, 0, [{ ask: "What did she say?", answer: "Show me on the other one first." }]);
    expect(calls.writes[0]).toContain("Show me on the other one first.");
    expect(calls.checks[0]).toContain("Show me on the other one first.");
    expect(result.after).toBe(70);
  });

  it("keeps the first rewrite if the second try fails", async () => {
    calls.scores.set(text(1), 50);
    calls.failSecond = true;
    const { rewriteEssay } = await import("@/lib/admitted/rewrite");
    expect((await rewriteEssay(draft, "", 650, 0)).after).toBe(50);
  });
});
