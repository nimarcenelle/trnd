import { describe, expect, it } from "vitest";

import { formatFounderEvent } from "../lib/notify";

describe("founder notifications", () => {
  it("formats a demo request with everything a follow-up call needs", () => {
    const { subject, body } = formatFounderEvent({
      kind: "demo_request",
      fullName: "Jordan Lee",
      email: "jordan@ellemes.com",
      businessName: "Ellemes Medical Spa",
      category: "Health & beauty",
      monthlySpend: "$1k–5k",
    });
    expect(subject).toContain("Ellemes Medical Spa");
    expect(body).toContain("jordan@ellemes.com");
    expect(body).toContain("$1k–5k");
  });

  it("omits absent fields instead of printing null", () => {
    const { body } = formatFounderEvent({
      kind: "demo_request",
      fullName: "Sam",
      email: "sam@x.co",
      businessName: "Sam's",
      category: null,
      monthlySpend: null,
    });
    expect(body).not.toContain("null");
  });

  it("formats a signup with the trial clock", () => {
    const { subject, body } = formatFounderEvent({
      kind: "signup",
      email: "nick3@gmail.com",
      businessName: "Lost In | Restaurant & Bar",
      category: "Restaurants & cafés",
      city: "Lisbon",
    });
    expect(subject).toContain("signup");
    expect(body).toContain("14 days");
  });
});
