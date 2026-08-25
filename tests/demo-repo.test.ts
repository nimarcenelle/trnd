import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-demo-test-"));

import { createDemoRepo } from "../lib/db/demo/repo";
import { resetStore } from "../lib/db/demo/store";
import type { NewBusiness } from "../lib/db/types";

const bizInput = (ownerId: string, name: string): NewBusiness => ({
  owner_id: ownerId,
  name,
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
});

describe("demo repo enforces the ownership rules RLS would", () => {
  beforeEach(() => resetStore());

  it("blocks cross-business reads", async () => {
    const alice = createDemoRepo({ kind: "user", userId: "user-alice" });
    const bob = createDemoRepo({ kind: "user", userId: "user-bob" });

    const aliceBiz = await alice.createBusiness(bizInput("user-alice", "Alice Aesthetics"));
    await alice.createServices([
      {
        business_id: aliceBiz.id,
        name: "Facial balancing consult",
        description: null,
        price_cents: 9900,
        is_active: true,
      },
    ]);

    expect(await bob.getBusiness(aliceBiz.id)).toBeNull();
    expect(await bob.listServices(aliceBiz.id)).toEqual([]);
    expect(await bob.listOpportunities(aliceBiz.id)).toEqual([]);
    expect(await bob.listCampaigns(aliceBiz.id)).toEqual([]);
  });

  it("blocks cross-business writes", async () => {
    const alice = createDemoRepo({ kind: "user", userId: "user-alice" });
    const bob = createDemoRepo({ kind: "user", userId: "user-bob" });
    const aliceBiz = await alice.createBusiness(bizInput("user-alice", "Alice Aesthetics"));

    await expect(
      bob.updateBusiness(aliceBiz.id, { name: "Hijacked" }),
    ).rejects.toThrow(/ownership/);
    await expect(
      bob.createServices([
        { business_id: aliceBiz.id, name: "x", description: null, price_cents: 0, is_active: true },
      ]),
    ).rejects.toThrow(/ownership/);
  });

  it("admin (service role) sees everything", async () => {
    const alice = createDemoRepo({ kind: "user", userId: "user-alice" });
    await alice.createBusiness(bizInput("user-alice", "Alice Aesthetics"));
    const admin = createDemoRepo({ kind: "admin" });
    expect((await admin.listAllBusinesses()).length).toBe(1);
  });

  it("dedupes signals per source/term/geo/day", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const sig = {
      source: "seed" as const,
      term: "facial balancing",
      normalized_term: "facial_balancing",
      category: "Health & beauty",
      geo: "US",
      metric_type: "conversation",
      value: 77,
      delta_pct: 38,
      window_days: 7,
      raw: null,
    };
    expect(await admin.upsertSignals([sig])).toBe(1);
    expect(await admin.upsertSignals([sig])).toBe(0);
  });
});
