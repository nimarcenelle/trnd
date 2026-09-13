import { describe, expect, it } from "vitest";

import { absoluteVolumeScore, actionScore, CUSTOMER_LOW_NOTE, MIN_ACTIVITY, ratioScore } from "../lib/scoring/customer";
import {
  classifyIntent,
  intentStrength,
  NEUTRAL_PLACEHOLDER,
  scoreCustomer,
  type CustomerInput,
  type DailyPoint,
} from "../lib/scoring/index";

const series = (values: number[]): DailyPoint[] =>
  values.map((value, i) => ({ day: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`, value }));

const baseline10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const activity = [
  { text: "best moisturizer for dry skin?" },
  { text: "why is my skin so itchy" },
  { text: "is it worth it" },
  { text: "what is ceramide" },
  { text: "cute packaging" },
];

const full = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  term: "ceramide cream",
  personaMatch: 1,
  personaSource: "orders",
  level: 10,
  levelBaseline: baseline10,
  activity,
  series: series(Array(30).fill(10)),
  ...over,
});

const comp = (s: ReturnType<typeof scoreCustomer>, key: string) => s.components.find((c) => c.key === key)!;

describe("classifyIntent", () => {
  it("applies precedence: complaint, purchase, pain, curiosity", () => {
    expect(classifyIntent("Worst price I have ever paid")).toBe("complaint");
    expect(classifyIntent("best serum for dry skin")).toBe("purchase_intent");
    expect(classifyIntent("help, my skin keeps peeling?")).toBe("pain_point");
    expect(classifyIntent("what is niacinamide")).toBe("curiosity");
    expect(classifyIntent("anyone tried this")).toBe("curiosity");
    expect(classifyIntent("love this color")).toBe("unrelated");
  });

  it("matches boundary phrases at the edges of the text", () => {
    expect(classifyIntent("cerave vs la roche posay")).toBe("purchase_intent");
    expect(classifyIntent("this is the best")).toBe("purchase_intent");
    expect(classifyIntent("VS code theme")).toBe("purchase_intent"); // "code" is a buying phrase
  });
});

describe("intentStrength", () => {
  it("is null with no activity", () => {
    expect(intentStrength([])).toBeNull();
  });

  it("weighs buying and pain fully, curiosity a little, unrelated nothing", () => {
    expect(
      intentStrength([
        { text: "", kind: "purchase_intent" },
        { text: "", kind: "pain_point" },
        { text: "", kind: "curiosity" },
        { text: "", kind: "unrelated" },
      ]),
    ).toBe(56.3);
    expect(intentStrength([{ text: "never again, want a refund" }])).toBe(100);
    expect(intentStrength([{ text: "nice", kind: "complaint" }])).toBe(100);
  });
});

describe("customer mappings", () => {
  it("maps the 7-day to 30-day ratio with 1.0 at 50", () => {
    expect(ratioScore(0.2)).toBe(0);
    expect(ratioScore(0.5)).toBe(0);
    expect(ratioScore(0.75)).toBe(25);
    expect(ratioScore(1)).toBe(50);
    expect(ratioScore(1.5)).toBe(75);
    expect(ratioScore(2)).toBe(100);
    expect(ratioScore(3)).toBe(100);
  });

  it("uses a log curve when the baseline is thin", () => {
    expect(absoluteVolumeScore(0)).toBe(0);
    expect(absoluteVolumeScore(99)).toBe(50);
    expect(absoluteVolumeScore(100000)).toBe(100);
  });

  it("ranks volume against the persona's baseline and discounts off-persona terms", () => {
    expect(comp(scoreCustomer(full()), "volume").score).toBe(95);
    expect(comp(scoreCustomer(full({ personaMatch: 0 })), "volume").score).toBe(47.5);
    expect(comp(scoreCustomer(full({ personaMatch: 0.5 })), "volume").score).toBe(71.3);
    expect(comp(scoreCustomer(full({ personaMatch: null })), "volume").score).toBe(95);
  });

  it("reads velocity from the series and needs 21 points", () => {
    expect(comp(scoreCustomer(full()), "velocity").score).toBe(50);
    const rising = scoreCustomer(full({ series: series([...Array(23).fill(10), ...Array(7).fill(20)]) }));
    expect(comp(rising, "velocity").score).toBeGreaterThan(75);
    expect(comp(rising, "velocity").detail).toMatch(/above the past month/);
    expect(comp(scoreCustomer(full({ series: series(Array(20).fill(10)) })), "velocity").score).toBeNull();
  });

  it("classifies activity when kind is absent", () => {
    // 3 strong (purchase, pain, purchase), 1 curiosity, 1 unrelated.
    const s = scoreCustomer(full());
    expect(comp(s, "intent").score).toBe(65);
    expect(comp(s, "intent").detail).toBe("3 of 5 customer posts show a real problem or a wish to buy");
  });
});

describe("scoreCustomer confidence and weights", () => {
  it("is high with a persona, a full baseline, 5+ activity and 21+ days", () => {
    const s = scoreCustomer(full());
    expect(s.confidence).toBe("high");
    expect(s.score).toBe(Math.round(((40 * 95 + 35 * 65 + 25 * 50) / 100) * 10) / 10);
    expect(s.note).toBeNull();
  });

  it("caps at medium when the baseline is too thin to rank", () => {
    const s = scoreCustomer(full({ level: 99, levelBaseline: [1, 2, 3] }));
    expect(comp(s, "volume").score).toBe(50);
    expect(comp(s, "volume").detail).toMatch(/too little history/);
    expect(s.confidence).toBe("medium");
  });

  it("is medium without a persona", () => {
    expect(scoreCustomer(full({ personaMatch: null, personaSource: null })).confidence).toBe("medium");
  });

  it("redistributes a missing component's weight", () => {
    const s = scoreCustomer(full({ level: null }));
    expect(comp(s, "volume").score).toBeNull();
    expect(s.confidence).toBe("medium");
    expect(s.score).toBe(Math.round(((35 * 65 + 25 * 50) / 60) * 10) / 10);
  });

  it("is low with no persona and no level", () => {
    const s = scoreCustomer(full({ personaMatch: null, level: null }));
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
    expect(s.note).toBe(CUSTOMER_LOW_NOTE);
    expect(s.cta).toBeNull();
  });

  it("is low when two of three components are missing", () => {
    const s = scoreCustomer(full({ activity: [], series: series(Array(10).fill(5)) }));
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
    expect(s.note).toBe(CUSTOMER_LOW_NOTE);
  });

  it("writes plain details with no em dashes, arrows or jargon", () => {
    for (const c of scoreCustomer(full({ levelBaseline: [] })).components) {
      expect(c.detail).toBeTruthy();
      expect(c.detail).not.toMatch(/[—→]|percentile/i);
    }
  });
});

describe("volume kinds and the shares-and-saves read", () => {
  it("scores each kind of level on its own curve", () => {
    // 10,000 monthly searches is the top of the searches curve...
    expect(absoluteVolumeScore(10_000)).toBe(100);
    expect(absoluteVolumeScore(10_000, "search_volume")).toBe(100);
    // ...but 10,000 short-form views is a middling week.
    expect(absoluteVolumeScore(10_000, "shortform_views")).toBe(75);
    expect(absoluteVolumeScore(1_000, "shortform_views")).toBeCloseTo(50, 0);
    expect(absoluteVolumeScore(100, "shortform_views")).toBeCloseTo(26, 0);
    // An index is already 0-100.
    expect(absoluteVolumeScore(63, "search_interest")).toBe(63);
    expect(absoluteVolumeScore(140, "index")).toBe(100);
    expect(absoluteVolumeScore(50, "conversation")).toBeCloseTo(42.8, 0);
  });

  it("names the kind in the volume detail", () => {
    const views = scoreCustomer(full({ level: 688, levelKind: "shortform_views", levelBaseline: [] }));
    expect(comp(views, "volume").detail).toContain("688 short-form views this week");
    const idx = scoreCustomer(full({ level: 63, levelKind: "index", levelBaseline: [] }));
    expect(comp(idx, "volume").detail).toContain("Search interest at 63 of 100");
  });

  it("turns shares and saves per view into intent: 0.1% is 25, 0.5% is 50, 1% is 75, 2% is 100", () => {
    expect(actionScore(0)).toBe(0);
    expect(actionScore(0.1)).toBe(25);
    expect(actionScore(0.5)).toBe(50);
    expect(actionScore(1)).toBe(75);
    expect(actionScore(2)).toBe(100);
    expect(actionScore(9)).toBe(100);
  });

  it("does not judge intent from fewer than three posts", () => {
    const one = scoreCustomer(full({ activity: [{ text: "best filter for hard water" }] }));
    expect(comp(one, "intent").score).toBeNull();
    expect(comp(one, "intent").detail).toContain("Only 1 customer post read on this, too few to judge");
    const three = scoreCustomer(full({ activity: activity.slice(0, MIN_ACTIVITY) }));
    expect(comp(three, "intent").score).not.toBeNull();
  });

  it("reads intent from shares and saves alone when nobody's words were read", () => {
    const s = scoreCustomer(full({ activity: [], actionPct: 2.2 }));
    expect(comp(s, "intent").score).toBe(100);
    expect(comp(s, "intent").detail).toMatch(/^Shares and saves run 2.2% of views on its short-form, strong for the format$/);
  });

  it("blends what they write with whether they save it, words first", () => {
    const words = scoreCustomer(full({ actionPct: null }));
    const both = scoreCustomer(full({ actionPct: 2 }));
    const text = comp(words, "intent").score as number;
    expect(comp(both, "intent").score).toBeCloseTo(0.6 * text + 0.4 * 100, 0);
    expect(comp(both, "intent").detail).toContain("and shares and saves run 2.0% of views");
  });
});
