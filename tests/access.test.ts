import { beforeAll, describe, expect, it, vi } from "vitest";

let access: typeof import("@/lib/creator/access");

beforeAll(async () => {
  vi.stubEnv("CREATOR_SECRET", "test-secret");
  vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
  vi.mock("@/lib/creator/store", () => ({ customerActive: async () => true }));
  access = await import("@/lib/creator/access");
});

describe("paid cookie", () => {
  it("round-trips a customer id", () => {
    expect(access.verifyPaidCookie(access.paidCookieValue("cus_123"))).toBe("cus_123");
  });
  it("refuses a forged or edited value", () => {
    const v = access.paidCookieValue("cus_123");
    expect(access.verifyPaidCookie(v.replace("cus_123", "cus_999"))).toBeNull();
    expect(access.verifyPaidCookie("cus_123.notasignature")).toBeNull();
    expect(access.verifyPaidCookie(undefined)).toBeNull();
    expect(access.verifyPaidCookie("nodot")).toBeNull();
  });
  it("unlocks nothing without a cookie", async () => {
    expect(await access.hasActivePlan()).toBe(false);
  });
});
