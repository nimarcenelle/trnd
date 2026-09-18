import { describe, expect, it } from "vitest";

import { firstWeekMode, objectiveList, parseCreativeContext, parseObjectives } from "@/lib/onboarding/context";

describe("campaign objectives", () => {
  it("reads every ticked objective in canonical order and drops what it does not know", () => {
    expect(parseObjectives(["awareness", "purchases", "roas", ""])).toEqual(["purchases", "awareness"]);
    expect(parseObjectives([])).toEqual([]);
  });

  it("reads the objectives off a form as a list", () => {
    const form = new FormData();
    form.append("campaign_objectives", "leads");
    form.append("campaign_objectives", "purchases");
    form.append("production_formats", "ugc");
    const ctx = parseCreativeContext(form);
    expect(ctx.campaign_objectives).toEqual(["purchases", "leads"]);
    expect(ctx.production_formats).toEqual(["ugc"]);
  });

  it("names them the way a person would", () => {
    expect(objectiveList([])).toBe("");
    expect(objectiveList(["purchases"])).toBe("purchases");
    expect(objectiveList(["purchases", "leads"])).toBe("purchases and leads or sign-ups");
    expect(objectiveList(["purchases", "traffic", "awareness"])).toBe("purchases, traffic and reach");
  });

  it("asks for the objectives only while none is set", () => {
    expect(firstWeekMode({ adHistoryRows: 3, objectives: 0 }).line).toMatch(/optimize for/);
    expect(firstWeekMode({ adHistoryRows: 3, objectives: 2 }).line).toBe("");
    expect(firstWeekMode({ adHistoryRows: 0, objectives: 2 }).researchOnly).toBe(true);
  });
});
