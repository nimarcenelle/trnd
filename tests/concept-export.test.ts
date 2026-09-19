import { describe, expect, it } from "vitest";

import { briefSections, conceptToDocx, conceptToMarkdown, type BriefExportView } from "../lib/picks/concept-export";

const view: BriefExportView = {
  title: "The crust on the showerhead",
  format: "20-second talking head",
  situation: "Someone notices white scale on the showerhead.",
  hypothesis: "Test whether opening on the scale is more persuasive.",
  hooks: { primary: "That white crust is in the water you wash with", alternatives: ["Look at your showerhead first"] },
  opening: { beats: [{ visual: "The scale in close-up.", on_screen_text: "", vo: "That white crust is in the water you wash with" }] },
  script: { direction: { show: "A real bathroom.", say: "Name the problem.", prove: "What it removes." }, cta: "Shop the filter, $68", duration_seconds: 20 },
  shotList: ["The scale.", "The filter going on."],
  approvedFacts: ["Removes chlorine", "$68"],
  guardrail: null,
  unknowns: ["Whether there is a real bathroom to shoot in."],
  differsFrom: "Recent ads opened on the product.",
  evaluation: { objectives: ["purchases"], comparison: "Run it beside your best ad.", budget: "5% of the month", watch: ["Cost per purchase"], caveats: [], missing: ["An export"] },
  outcomes: { if_better: "Keep the moment.", if_same: "Try the second hook.", if_worse: "Open on the product." },
  evidence: [{ signal: "customer", label: "What customers say", rows: [{ id: "e1", claim: "People search hard water.", kind: "measurement", href: null, sourceLabel: "DataForSEO", observedOn: "2026-09-10", sampleSize: null, limitation: "Volume is not intent." }] }],
  researchTerm: "hard water",
  trackingName: "TRND: The crust on the showerhead",
  lineage: null,
};

describe("the brief as a file", () => {
  it("renders the same sections to Markdown, in the order a creator reads them", () => {
    const md = conceptToMarkdown(view);
    expect(md.startsWith("# The crust on the showerhead\n\nFormat: 20-second talking head\n")).toBe(true);
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.slice(0, 5)).toEqual(["The customer situation", "The hypothesis (what we think may work, and why)", "Hook", "Other openings for the same concept", "The first three seconds (shoot these as written)"]);
    expect(md).toContain("1. See: The scale in close-up. | Say: That white crust is in the water you wash with");
    expect(md).toContain("- Removes chlorine");
    expect(md).toContain("Name the ad: TRND: The crust on the showerhead");
    expect(md).toContain("  Limit: Volume is not intent.");
    expect(md).not.toMatch(/\n{3,}/);
    expect(briefSections({ ...view, opening: null, guardrail: "No before and after." }).map((s) => s.heading)).toContain("Guardrail");
  });

  it("produces a Word document", async () => {
    const buf = await conceptToDocx(view);
    // A .docx is a zip: it starts with the PK signature.
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buf.length).toBeGreaterThan(2000);
  });
});
