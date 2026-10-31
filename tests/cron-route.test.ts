import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "./fakes/supabase";

/** The cron route: the secret, a single creator's scan (with an on-demand budget), and the fan-out. */

const db = { current: new FakeDb() };
const scanCreator = vi.fn<(id: string, opts?: { resume?: boolean; budgetMs?: number }) => Promise<object>>(async (id) => ({ creator: id, stages: [], handedOff: false }));
const fetchSelf = vi.fn<(url: string, timeoutMs: number) => Promise<Response>>(async () => new Response("{}"));

vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current }));
vi.mock("@/lib/env", () => ({ env: { cronSecret: "s", alertEmail: "ops@example" }, isStripeConfigured: false }));
const alerts: string[] = [];
vi.mock("@/lib/email", () => ({ sendEmail: async (_to: string, subject: string) => void alerts.push(subject) }));
vi.mock("@/lib/creators/scan", () => ({ SCAN_STALE_MS: 600_000, scanCreator, fetchSelf, selfUrl: () => "https://creators.example" }));

const { GET } = await import("@/app/api/cron/scan/route");
const call = (query = "", secret = "s") => GET(new Request(`https://creators.test/api/cron/scan${query}`, { headers: { authorization: `Bearer ${secret}` } }));

beforeEach(() => {
  db.current = new FakeDb();
  scanCreator.mockClear();
  fetchSelf.mockClear();
  alerts.length = 0;
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
    // The site's own domain, never the host the cron request came in on (Vercel Cron uses the protected *.vercel.app URL).
    expect(fetchSelf).toHaveBeenCalledWith("https://creators.example/api/cron/scan?creator=c1&resume=1", 1000);
  });

  it("doesn't count a scan the route refused as started", async () => {
    db.current.rows("creators").push({ id: "c1", plan: "trial", plan_status: "active", trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(), scan_status: "idle", last_scan_at: null });
    fetchSelf.mockResolvedValueOnce(new Response("", { status: 302 }));
    expect(await (await call()).json()).toEqual({ due: 1, started: 0 });
  });

  it("backs off an account that keeps failing, and skips one read today", async () => {
    const day = 86_400_000;
    const base = { plan: "trial", plan_status: "active", trial_ends_at: new Date(Date.now() + day).toISOString() };
    db.current.rows("creators").push(
      { ...base, id: "fresh", scan_status: "idle", last_scan_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), scan_failures: 0 },
      { ...base, id: "stale", scan_status: "idle", last_scan_at: new Date(Date.now() - day).toISOString(), scan_failures: 0 },
      { ...base, id: "failing", scan_status: "error", scan_started_at: new Date(Date.now() - day).toISOString(), last_scan_at: null, scan_failures: 4 },
      { ...base, id: "failed-long-ago", scan_status: "error", scan_started_at: new Date(Date.now() - 8 * day).toISOString(), last_scan_at: null, scan_failures: 9 },
    );
    expect(await (await call()).json()).toEqual({ due: 2, started: 2 });
    const ids = fetchSelf.mock.calls.map(([u]) => new URL(u).searchParams.get("creator")).sort();
    expect(ids).toEqual(["failed-long-ago", "stale"]);
  });

  it("emails a note when reads are failing, and stays quiet on a good day", async () => {
    const base = { plan: "trial", plan_status: "active", trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() };
    db.current.rows("creators").push({ ...base, id: "ok", handle: "ok", scan_status: "idle", last_scan_at: new Date().toISOString(), scan_failures: 0 });
    await call();
    expect(alerts).toEqual([]);
    db.current.rows("creators").push({ ...base, id: "bad", handle: "bad", scan_status: "error", scan_error: "Our TikTok reader is paused on our side.", scan_started_at: new Date().toISOString(), scan_failures: 2 });
    await call();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/1 failing/);
  });
});
