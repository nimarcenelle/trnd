import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Static guarantee that no table ships without RLS. The live cross-business
 * check runs in tests/rls-live.test.ts when Supabase creds are present, and
 * the same ownership semantics are unit-tested against the demo repo in
 * tests/demo-repo.test.ts.
 */
describe("migrations", () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");

  const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map(
    (m) => m[1],
  );

  it("defines the full schema from the brief", () => {
    for (const required of [
      "profiles",
      "businesses",
      "services",
      "signals",
      "signal_series",
      "opportunities",
      "campaigns",
      "creatives",
      "campaign_results",
      "learnings",
      "subscriptions",
      "demo_requests",
    ]) {
      expect(tables).toContain(required);
    }
  });

  it("enables row level security on every table", () => {
    for (const table of tables) {
      expect(
        sql.includes(`alter table public.${table} enable row level security`),
        `table ${table} is missing RLS`,
      ).toBe(true);
    }
  });

  it("dedupes signals per source/term/geo/day", () => {
    expect(sql).toMatch(/create unique index signals_daily_uniq/);
  });
});
