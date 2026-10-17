import { describe, expect, it } from "vitest";

import { ApifyUnavailable, apifyIsDown, assertApifyUp, noteApifyStatus } from "@/lib/apify";
import { NoRetry } from "@/lib/retry";

describe("apify breaker", () => {
  it("passes ordinary answers and switches Apify off on an account-level refusal", () => {
    expect(() => noteApifyStatus(200)).not.toThrow();
    expect(() => noteApifyStatus(500)).not.toThrow();
    expect(apifyIsDown()).toBe(false);
    expect(() => noteApifyStatus(402)).toThrow(/out of credit/);
    expect(apifyIsDown()).toBe(true);
    try {
      assertApifyUp();
    } catch (err) {
      expect(err).toBeInstanceOf(ApifyUnavailable);
      expect(err).toBeInstanceOf(NoRetry);
    }
  });
});
