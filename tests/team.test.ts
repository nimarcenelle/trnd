import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-team-"));

const { createDemoRepo, OwnershipError } = await import("../lib/db/demo/repo");
const { loadStore, resetStore, saveStore } = await import("../lib/db/demo/store");

/**
 * A brand is a team: the owner invites by email, the invited person sees
 * the brand through the same ownership rules the owner does, and the
 * business row and the roster stay the owner's. A brief can be shared by
 * token to someone with no account at all.
 */

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "eskiin",
  category: "Beauty & wellness",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: "https://eskiin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  market: "online",
  monthly_ad_spend: "50-100k",
  ad_platforms: ["meta"],
});

const bundle = (): NewPickBundle => ({
  pick: {
    opportunity_id: null,
    rank: 1,
    geo: "US",
    term: "hard water",
    finding: 'Your customers are searching "hard water."',
    metric_label: "Searches",
    metric_value: 1000,
    metric_delta_pct: 20,
    metric_window: "week",
    sparkline: [],
    bet_what: "The crust on the showerhead",
    bet_budget_usd: 2500,
    bet_duration_days: 5,
    bet_kill_rule: "",
    guardrail: null,
    concept_title: "The crust on the showerhead",
    status: "ready",
  },
  evidence: [{ signal: "customer", claim: "People search it.", source_url: null, source_label: null }],
  scripts: ["A", "B", "C"].map((label) => ({
    variant_label: label,
    thesis: "t",
    hook: `Hook ${label}`,
    beats: [],
    direction: { show: "s", say: "s", prove: "p" },
    cta: "Shop",
    duration_seconds: 20,
  })),
});

function addUser(id: string, email: string) {
  const store = loadStore();
  store.users.push({ id, email, full_name: null, password_hash: "x", salt: "x", created_at: new Date().toISOString() });
  store.profiles.push({ id, email, full_name: null, created_at: new Date().toISOString() });
  saveStore();
}

describe("the roster", () => {
  beforeEach(() => resetStore());

  it("lets an invited teammate see the brand, claims the invitation at first sign-in, and keeps the business row the owner's", async () => {
    addUser("owner", "owner@eskiin.com");
    addUser("buyer", "buyer@agency.com");
    const owner = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await owner.createBusiness(bizInput("owner"));
    const buyerBefore = createDemoRepo({ kind: "user", userId: "buyer" });
    expect(await buyerBefore.getBusinessForUser({ id: "buyer", email: "buyer@agency.com" })).toBeNull();

    const invite = await owner.inviteMember({ business_id: biz.id, email: "Buyer@Agency.com", invited_by: "owner" });
    expect(invite).toMatchObject({ email: "buyer@agency.com", user_id: null, role: "member" });
    // Idempotent on the email.
    expect((await owner.inviteMember({ business_id: biz.id, email: "buyer@agency.com" })).id).toBe(invite.id);
    expect(await owner.listMembers(biz.id)).toHaveLength(1);

    const buyer = createDemoRepo({ kind: "user", userId: "buyer" });
    const seen = await buyer.getBusinessForUser({ id: "buyer", email: "buyer@agency.com" });
    expect(seen?.id).toBe(biz.id);
    expect((await owner.listMembers(biz.id))[0]).toMatchObject({ user_id: "buyer" });
    expect((await owner.listMembers(biz.id))[0].accepted_at).not.toBeNull();
    // The member reads the brand's data through the same rules.
    expect(await buyer.listServices(biz.id)).toEqual([]);
    expect(await buyer.listMembers(biz.id)).toHaveLength(1);
    // And never edits the roster or invites.
    await expect(buyer.inviteMember({ business_id: biz.id, email: "x@y.com" })).rejects.toBeInstanceOf(OwnershipError);
    await expect(buyer.removeMember(invite.id)).rejects.toBeInstanceOf(OwnershipError);

    await owner.removeMember(invite.id);
    expect(await owner.listMembers(biz.id)).toEqual([]);
    expect(await createDemoRepo({ kind: "user", userId: "buyer" }).getBusinessForUser({ id: "buyer", email: "buyer@agency.com" })).toBeNull();
  });

  it("finds an invitation by email for the signup gate, and a stranger sees nothing", async () => {
    addUser("owner", "owner@eskiin.com");
    const owner = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await owner.createBusiness(bizInput("owner"));
    await owner.inviteMember({ business_id: biz.id, email: "creator@studio.com" });
    const admin = createDemoRepo({ kind: "admin" });
    expect((await admin.findMembershipByEmail("Creator@Studio.com"))?.business_id).toBe(biz.id);
    expect(await admin.findMembershipByEmail("nobody@x.com")).toBeNull();
    addUser("stranger", "stranger@x.com");
    const stranger = createDemoRepo({ kind: "user", userId: "stranger" });
    expect(await stranger.getBusinessForUser({ id: "stranger", email: "stranger@x.com" })).toBeNull();
    await expect(stranger.listServices(biz.id)).resolves.toEqual([]);
  });
});

describe("the share link", () => {
  beforeEach(() => resetStore());

  it("reads a brief by its token as admin, and nothing once the token is retired", async () => {
    addUser("owner", "owner@eskiin.com");
    const owner = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await owner.createBusiness(bizInput("owner"));
    const [pickId] = await owner.replaceWeekPicks(biz.id, "2026-09-14", [bundle()]);
    await owner.setPickShareToken(pickId, "tok_abc123456789xyz");
    const admin = createDemoRepo({ kind: "admin" });
    const found = await admin.getPickDetailByShareToken("tok_abc123456789xyz");
    expect(found?.detail.pick.id).toBe(pickId);
    expect(found?.business.name).toBe("eskiin");
    expect(await admin.getPickDetailByShareToken("nope")).toBeNull();
    await owner.setPickShareToken(pickId, null);
    expect(await admin.getPickDetailByShareToken("tok_abc123456789xyz")).toBeNull();
    // A user-scoped repo never reads by token: the public page is the admin's.
    await expect(owner.getPickDetailByShareToken("tok_abc123456789xyz")).rejects.toBeInstanceOf(OwnershipError);
  });
});
