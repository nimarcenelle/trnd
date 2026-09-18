import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { Business, NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-meta-callbacks-"));
process.env.META_APP_ID = "app";
process.env.META_APP_SECRET = "the-app-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://usetrnd.com";

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const {
  deauthorizeMetaUser,
  deleteMetaUserData,
  deletionConfirmationCode,
  parseSignedRequest,
  signRequest,
  verifyDeletionConfirmation,
} = await import("../lib/ads/meta-callbacks");

const SECRET = "the-app-secret";

const bizInput = (ownerId: string, name: string): NewBusiness => ({
  owner_id: ownerId,
  name,
  category: "Apparel",
  city: "Austin",
  region: "TX",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 12,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: [],
});

describe("Meta's signed_request", () => {
  it("round-trips through the app secret and refuses anything else", () => {
    const raw = signRequest({ user_id: "10001", issued_at: 1_758_000_000 }, SECRET);
    expect(parseSignedRequest(raw, SECRET)).toEqual({ user_id: "10001", algorithm: "HMAC-SHA256", issued_at: 1_758_000_000 });

    // Signed with someone else's secret: not Meta.
    expect(parseSignedRequest(signRequest({ user_id: "10001" }, "other"), SECRET)).toBeNull();
    // The payload changed after signing.
    const [sig] = raw.split(".");
    const forged = `${sig}.${Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url")}`;
    expect(parseSignedRequest(forged, SECRET)).toBeNull();
    // Not even the shape.
    expect(parseSignedRequest("", SECRET)).toBeNull();
    expect(parseSignedRequest("nodot", SECRET)).toBeNull();
    expect(parseSignedRequest(raw, "")).toBeNull();
  });

  it("reads the id Meta sends as a number too, and insists on HMAC-SHA256", () => {
    const encoded = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: 10001 })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(encoded).digest("base64url");
    expect(parseSignedRequest(`${sig}.${encoded}`, SECRET)?.user_id).toBe("10001");

    const wrongAlgo = Buffer.from(JSON.stringify({ algorithm: "MD5", user_id: "1" })).toString("base64url");
    const sig2 = createHmac("sha256", SECRET).update(wrongAlgo).digest("base64url");
    expect(parseSignedRequest(`${sig2}.${wrongAlgo}`, SECRET)).toBeNull();
  });
});

describe("the deletion confirmation", () => {
  it("verifies without a table and rejects a tampered code", () => {
    const at = new Date("2026-09-18T02:00:00Z");
    const code = deletionConfirmationCode("10001", at, SECRET);
    expect(verifyDeletionConfirmation(code, SECRET)).toEqual({ userId: "10001", deletedAt: at });
    expect(verifyDeletionConfirmation(code, "other")).toBeNull();
    expect(verifyDeletionConfirmation(`${code}x`, SECRET)).toBeNull();
    expect(verifyDeletionConfirmation(null, SECRET)).toBeNull();
  });
});

describe("what the callbacks do to the store", () => {
  beforeEach(() => resetStore());

  const connection = (biz: Business, userId: string) => ({
    business_id: biz.id,
    provider: "meta" as const,
    status: "connected" as const,
    account_id: "act_42",
    account_name: "Northfield",
    provider_user_id: userId,
    access_token: "tok",
    refresh_token: null,
    token_expires_at: null,
    scopes: ["ads_read"],
  });

  const historyRow = (biz: Business, source: "meta_api" | "meta_export", name: string) => ({
    business_id: biz.id,
    platform: "meta" as const,
    campaign_name: "Prospecting",
    ad_name: name,
    copy: null,
    impressions: 1000,
    clicks: 20,
    spend_cents: 5000,
    results: 1,
    ctr: 0.02,
    started_on: "2026-08-01",
    ended_on: null,
    source,
  });

  async function setup() {
    const admin = createDemoRepo({ kind: "admin" });
    const owner = createDemoRepo({ kind: "user", userId: "owner" });
    const other = createDemoRepo({ kind: "user", userId: "other" });
    const mine: Business = await owner.createBusiness(bizInput("owner", "Northfield Goods"));
    const theirs: Business = await other.createBusiness(bizInput("other", "Someone Else"));
    await owner.upsertConnection(connection(mine, "10001"));
    await other.upsertConnection(connection(theirs, "20002"));
    await owner.upsertAdHistory([historyRow(mine, "meta_api", "Synced"), historyRow(mine, "meta_export", "Uploaded")]);
    await other.upsertAdHistory([historyRow(theirs, "meta_api", "Their synced")]);
    return { admin, owner, other, mine, theirs };
  }

  it("deauthorize marks only that person's connection revoked and drops the dead token", async () => {
    const { admin, owner, other, mine, theirs } = await setup();
    expect(await deauthorizeMetaUser(admin, "10001")).toEqual({ revoked: 1 });
    const revoked = await owner.getConnection(mine.id, "meta");
    expect(revoked?.status).toBe("revoked");
    expect(revoked?.access_token).toBe("");
    expect(revoked?.account_name).toBe("Northfield");
    expect((await other.getConnection(theirs.id, "meta"))?.status).toBe("connected");
    // Sent twice (Meta retries): nothing more to do, nothing broken.
    expect(await deauthorizeMetaUser(admin, "10001")).toEqual({ revoked: 0 });
    // A person who never connected: a no-op, not an error.
    expect(await deauthorizeMetaUser(admin, "30003")).toEqual({ revoked: 0 });
  });

  it("data deletion removes the connection and what it synced, keeps the upload, and answers Meta", async () => {
    const { admin, owner, other, mine, theirs } = await setup();
    const now = new Date("2026-09-18T02:00:00Z");
    const result = await deleteMetaUserData(admin, "10001", now);
    expect(result.connections).toBe(1);
    expect(result.adHistoryRows).toBe(1);
    expect(verifyDeletionConfirmation(result.confirmationCode, SECRET)).toEqual({ userId: "10001", deletedAt: now });
    expect(result.statusUrl).toBe(`https://usetrnd.com/api/connect/meta/data-deletion?code=${encodeURIComponent(result.confirmationCode)}`);

    expect(await owner.getConnection(mine.id, "meta")).toBeNull();
    expect((await owner.listAdHistory(mine.id)).map((r) => r.ad_name)).toEqual(["Uploaded"]);
    // The other brand's connection and rows are untouched.
    expect((await other.getConnection(theirs.id, "meta"))?.status).toBe("connected");
    expect(await other.listAdHistory(theirs.id)).toHaveLength(1);

    // Nothing to delete is still a completed request with a code Meta can show.
    const again = await deleteMetaUserData(admin, "10001", now);
    expect(again.connections).toBe(0);
    expect(verifyDeletionConfirmation(again.confirmationCode, SECRET)?.userId).toBe("10001");
  });
});
