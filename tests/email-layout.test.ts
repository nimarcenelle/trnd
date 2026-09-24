import { describe, expect, it } from "vitest";

import type { Business } from "../lib/db/types";
import { firstPicksSubject, renderFirstPicksEmail } from "../lib/email/first-picks";
import { renderEmail } from "../lib/email/layout";
import { renderWeeklyBriefsEmail, weeklyBriefsSubject, type BriefLine } from "../lib/email/weekly-briefs";

describe("email layout", () => {
  const html = renderEmail({
    preheader: "The hidden preview line",
    title: "Run it <script>alert(1)</script>",
    intro: "One sentence of context.",
    body: "<p>body</p>",
    cta: { label: "Open it", url: "https://usetrnd.com/app/picks?week=2026-09-14" },
    footnote: "A quiet line.",
  });

  it("escapes a script in the title", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries the wordmark, the CTA url and the preheader", () => {
    expect(html).toContain(">TRND</span>");
    expect(html).toContain("#1ea7ae");
    expect(html).toContain('href="https://usetrnd.com/app/picks?week=2026-09-14"');
    expect(html).toContain("Open it");
    expect(html).toContain("The hidden preview line");
    expect(html).toContain("You get this because you have a TRND account.");
  });

  it("is a full document with no button when there is no cta", () => {
    const bare = renderEmail({ preheader: "p", title: "t", intro: "i", body: "", cta: null, footnote: null });
    expect(bare.startsWith("<!doctype html>")).toBe(true);
    expect(bare).not.toContain("border-radius:999px");
  });
});

describe("the Monday briefs email", () => {
  const business = { id: "b", owner_id: "o", name: "glow room", city: "Atlanta", region: "GA", market: "online" } as unknown as Business;
  const briefs: BriefLine[] = [
    { rank: 1, title: "The towel that slips", hypothesis: "Test whether the slipping towel is more persuasive than the material, because customers describe the problem first.", format: "20-second talking head", basis: "Explores new ground", href: "https://usetrnd.com/app/picks/p1", status: "proposed" },
    { rank: 2, title: "One take, start to finish <b>", hypothesis: "Test whether one unbroken shot is more persuasive than cuts.", format: "20-second single-take demo", basis: "Builds on a result", href: "https://usetrnd.com/app/picks/p2", status: "chosen" },
  ];

  it("lists each test with its hypothesis, format and status, says when fewer than three cleared the bar, and links the week", () => {
    const html = renderWeeklyBriefsEmail({
      business,
      weekRange: "Sep 14 – Sep 20",
      briefs,
      openTests: [{ title: "The crust on the showerhead", status: "running", since: "Sep 9" }],
      researchOnly: true,
      url: "https://usetrnd.com/app/picks",
      resultsUrl: "https://usetrnd.com/app/campaigns",
    });
    expect(html).toContain("The towel that slips");
    expect(html).toContain("One take, start to finish &lt;b&gt;");
    expect(html).toContain("20-second talking head");
    expect(html).toContain("In production");
    expect(html).toContain("Only two concepts cleared the bar this week.");
    expect(html).toContain("The crust on the showerhead");
    expect(html).toContain("launched Sep 9, no result recorded yet");
    expect(html).toContain("No ad results are on file");
    expect(html).toContain('href="https://usetrnd.com/app/picks"');
    expect(html).toContain("Open this week&#39;s briefs");
    expect(html).toContain("Briefs are hypotheses, not winners.");
    // Never a grade or a score.
    expect(html).not.toMatch(/\bgrade\b/i);
  });

  it("keeps the subject in the brand's name", () => {
    expect(weeklyBriefsSubject(business, 3)).toBe("Glow room: 3 creative tests for this week");
    expect(weeklyBriefsSubject(business, 1)).toBe("Glow room: one creative test for this week");
  });
});

describe("first picks email", () => {
  it("pluralizes the subject", () => {
    expect(firstPicksSubject(1)).toBe("Your first pick is ready");
    expect(firstPicksSubject(3)).toBe("Your first 3 picks are ready");
  });

  it("names the business and links the picks page", () => {
    const html = renderFirstPicksEmail({ businessName: "bellwood <run>", count: 2, url: "https://usetrnd.com/app/picks" });
    expect(html).toContain("Bellwood &lt;run&gt;");
    expect(html).toContain('href="https://usetrnd.com/app/picks"');
    expect(html).toContain("Your first 2 picks are ready");
  });
});

describe("inline styles", () => {
  it("never put a double quote inside a style attribute", () => {
    const html = renderEmail({ preheader: "p", title: "t", intro: "i", body: "", cta: { label: "Go", url: "https://x" }, footnote: "f" });
    for (const m of html.matchAll(/style="([^"]*)"/g)) expect(m[1]).not.toMatch(/font-family:\s*$/);
    expect(html).toContain("font-family:'Instrument Sans'");
  });
});
