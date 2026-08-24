import { describe, expect, it } from "vitest";

import { sentenceCase, titleCase } from "../lib/text";

describe("casing helpers", () => {
  it("title-cases terms like titles", () => {
    expect(titleCase("korean glass skin facial")).toBe("Korean Glass Skin Facial");
    expect(titleCase("lip flip vs filler")).toBe("Lip Flip vs Filler");
    expect(titleCase("recovery and wellness add-ons")).toBe("Recovery and Wellness Add-ons");
    expect(titleCase("ac tune up before summer")).toBe("Ac Tune Up Before Summer");
  });
  it("keeps small words lowercase except at the edges", () => {
    expect(titleCase("the art of the deal")).toBe("The Art of the Deal");
  });
  it("sentence-cases past leading symbols", () => {
    expect(sentenceCase("education angles ran well before")).toBe("Education angles ran well before");
    expect(sentenceCase("↑47% conversation this week")).toBe("↑47% Conversation this week");
  });
});
