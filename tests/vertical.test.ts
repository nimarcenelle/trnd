import { describe, expect, it } from "vitest";

import { verticalFor, verticalKey } from "../lib/signals/vertical";

describe("verticalFor — free-text identity → signal vertical", () => {
  it("passes an exact vertical name straight through", () => {
    expect(verticalFor("Health & beauty")).toBe("Health & beauty");
    expect(verticalFor("Fitness studios")).toBe("Fitness studios");
  });

  it("maps a recovery studio to Health & beauty, never a gym", () => {
    // The RVIVL case: marketed as fitness recovery, sells treatments.
    expect(verticalFor("Contrast therapy & recovery studio")).toBe("Health & beauty");
    expect(verticalFor("sauna and cold plunge lounge")).toBe("Health & beauty");
    expect(verticalFor("IV drip & wellness bar")).toBe("Health & beauty");
  });

  it("keeps real workout businesses in Fitness studios", () => {
    expect(verticalFor("boutique pilates studio")).toBe("Fitness studios");
    expect(verticalFor("crossfit gym")).toBe("Fitness studios");
  });

  it("classifies the other verticals from customer-language identities", () => {
    expect(verticalFor("neighborhood espresso bar")).toBe("Restaurants & cafés");
    expect(verticalFor("mobile detailing service")).toBe("Auto services");
    expect(verticalFor("emergency plumbing company")).toBe("Home services");
    expect(verticalFor("vintage clothing boutique")).toBe("Retail & boutiques");
    expect(verticalFor("family dental practice")).toBe("Dental & wellness");
  });

  it("uses hints (services, lexicon) when the identity alone is vague", () => {
    expect(verticalFor("The Reset Room", ["infrared sauna", "ice bath", "compression boots"])).toBe(
      "Health & beauty",
    );
  });

  it("returns null when nothing matches, and verticalKey falls back to the raw string", () => {
    expect(verticalFor("municipal kazoo repository")).toBeNull();
    expect(verticalKey("municipal kazoo repository")).toBe("municipal kazoo repository");
    expect(verticalKey("Contrast therapy & recovery studio")).toBe("Health & beauty");
  });
});
