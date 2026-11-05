import { beforeEach, describe, expect, it, vi } from "vitest";

const table = vi.hoisted(() => new Map<string, { kind: string; value: unknown }>());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { essayEncryptionKey: Buffer.alloc(32, 7).toString("base64") } }));
vi.mock("@/lib/db/supabase", () => ({
  adminSupabase: () => ({
    from: () => ({
      select: () => ({ in: async (_: string, keys: string[]) => ({ data: keys.filter((k) => table.has(k)).map((key) => ({ key, value: table.get(key)!.value })), error: null }) }),
      upsert: async (rows: { key: string; kind: string; value: unknown }[]) => {
        for (const r of rows) if (!table.has(r.key)) table.set(r.key, r);
        return { error: null };
      },
    }),
  }),
}));

describe("saved results", () => {
  beforeEach(() => table.clear());

  it("stores essay results encrypted and reads them back", async () => {
    const { readSaved, saveFirst } = await import("@/lib/admitted/saved");
    const value = { score: 58, notes: [{ quote: "The left boot always comes in worse." }] };
    expect((await saveFirst("review", [{ key: "k", value }])).get("k")).toEqual(value);
    expect(JSON.stringify(table.get("k"))).not.toContain("boot");
    expect((await readSaved(["k"])).get("k")).toEqual(value);
  });

  it("keeps the first result when a second one races it", async () => {
    const { saveFirst } = await import("@/lib/admitted/saved");
    await saveFirst("rewrite", [{ key: "k", value: { after: 1 } }]);
    expect((await saveFirst("rewrite", [{ key: "k", value: { after: 2 } }])).get("k")).toEqual({ after: 1 });
  });

  it("treats a row sealed under another key as a miss", async () => {
    const { readSaved } = await import("@/lib/admitted/saved");
    table.set("k", { kind: "review", value: { sealed: "AAAA.AAAA.AAAA" } });
    expect((await readSaved(["k"])).has("k")).toBe(false);
  });

  it("health check stores one sealed row however often it runs", async () => {
    const { sealedStoreWorks } = await import("@/lib/admitted/saved");
    expect(await sealedStoreWorks()).toBe(true);
    expect(await sealedStoreWorks()).toBe(true);
    expect(table.size).toBe(1);
    expect(JSON.stringify(table.get("healthcheck:sealed"))).toContain("sealed");
  });

  it("leaves odds readable as before", async () => {
    const { saveFirst } = await import("@/lib/admitted/saved");
    await saveFirst("odds", [{ key: "k", value: { odds: 6 } }]);
    expect(table.get("k")?.value).toEqual({ odds: 6 });
  });
});
