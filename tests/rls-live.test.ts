import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const configured = Boolean(url && anon);

/**
 * Live RLS verification against a real Supabase project. Skipped (loudly)
 * when creds are absent — see BLOCKED.md. Run with env set to prove that an
 * anonymous client cannot read protected tables.
 */
describe.skipIf(!configured)("live Supabase RLS", () => {
  it("anon client cannot read businesses", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url!, anon!);
    const { data } = await sb.from("businesses").select("*");
    expect(data ?? []).toEqual([]);
  });
});

if (!configured) {
  describe("live Supabase RLS", () => {
    it.skip("SKIPPED: set NEXT_PUBLIC_SUPABASE_URL / ANON_KEY to run (BLOCKED.md)", () => {});
  });
}
