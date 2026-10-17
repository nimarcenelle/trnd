import { describe, expect, it } from "vitest";

import { checkUnsubscribeToken, unsubscribeToken, unsubscribeUrl } from "@/lib/unsubscribe";

describe("unsubscribe links", () => {
  it("accepts the brand's own token only", () => {
    const t = unsubscribeToken("brand-1", "k");
    expect(checkUnsubscribeToken("brand-1", t, "k")).toBe(true);
    expect(checkUnsubscribeToken("brand-2", t, "k")).toBe(false);
    expect(checkUnsubscribeToken("brand-1", t, "other-key")).toBe(false);
    expect(checkUnsubscribeToken("brand-1", "", "k")).toBe(false);
    expect(checkUnsubscribeToken("brand-1", t, "")).toBe(false);
  });

  it("builds the link", () => {
    process.env.UNSUBSCRIBE_SECRET = "k";
    expect(unsubscribeUrl("https://usetrnd.com/", "b1")).toBe(`https://usetrnd.com/api/unsubscribe?b=b1&t=${unsubscribeToken("b1", "k")}`);
  });
});
