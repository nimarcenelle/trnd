import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "./fakes/supabase";

/** The cron route: the secret, a single creator's scan (with an on-demand budget), and the fan-out. */

const db = { current: new FakeDb() };
const scanCreator = vi.fn<(id: string, opts?: { resume?: boolean; budgetMs?: number }) => Promise<object>>(async (id) => ({ creator: id, stages: [], handedOff: false }));
const fetchSelf = vi.fn<(url: string, timeoutMs: number) => Promise<Response>>(async () => new Response("{}"));

vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current }));
vi.mock("@/lib/env", () => ({ env: { cronSecret: "s" }, isStripeConfigured: false }));
vi.mock("@/lib/creators/scan", () => ({ SCAN_STALE_MS: 600_000, scanCreator, fetchSelf }));

const { GET } = await import("@/app/api/cron/scan/route");
const call = (query = "", secret = "s") => GET(new Request(`https://creators.test/api/cron/scan${query}`, { headers: { authorization: `Bearer ${secret}` } }));

beforeEach(() => {
  db.current = new FakeDb();
  scanCreator.mockClear();
  fetchSelf.mockClear();
});

describe("/api/cron/scan", () => {
  it("refuses a request without the secret", async () => {
    expect((await call("?creator=c1", "wrong")).status).toBe(401);
    expect(scanCreator).not.toHaveBeenCalled();
  });

  it("passes ?budget= through, so a stage hand-off can be exercised on demand, and ignores a bad one", async () => {
    await call("?creator=c1&resume=1&budget=1");
    expect(scanCreator).toHaveBeenLastCalledWith("c1", { resume: true, budgetMs: 1 });
    await call("?creator=c1&budget=abc");
    expect(scanCreator).toHaveBeenLastCalledWith("c1", { resume: false, budgetMs: undefined });
  });

  it("starts each due creator's scan through the redirect-safe self fetch", async () => {
    db.current.rows("creators").push({ id: "c1", plan: "trial", plan_status: "active", trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(), scan_status: "idle", last_scan_at: null });
    const res = await (await call()).json();
    expect(res).toEqual({ due: 1, started: 1 });
    expect(fetchSelf).toHaveBeenCalledWith("https://creators.test/api/cron/scan?creator=c1&resume=1", 1000);
  });
});
