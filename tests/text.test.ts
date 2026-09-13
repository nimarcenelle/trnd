import { describe, expect, it } from "vitest";

import { sentenceCase } from "../lib/text";

describe("sentenceCase", () => {
  it("capitalizes the first letter and leaves the rest as entered", () => {
    expect(sentenceCase("korean glass skin facial")).toBe("Korean glass skin facial");
    expect(sentenceCase("eskiin")).toBe("Eskiin");
    expect(sentenceCase("Fellow Ode Brew Grinder")).toBe("Fellow Ode Brew Grinder");
    expect(sentenceCase("coffee roaster with five cafés")).toBe("Coffee roaster with five cafés");
  });
  it("sentence-cases past leading symbols", () => {
    expect(sentenceCase("education angles ran well before")).toBe("Education angles ran well before");
    expect(sentenceCase("↑47% conversation this week")).toBe("↑47% Conversation this week");
    expect(sentenceCase("")).toBe("");
  });
});
