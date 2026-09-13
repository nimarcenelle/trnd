import { describe, expect, it } from "vitest";

import type { Business, IntelNote } from "../lib/db/types";
import { firstPicksSubject, renderFirstPicksEmail } from "../lib/email/first-picks";
import { renderEmail } from "../lib/email/layout";
import { renderWeeklyReportEmail, weeklyReportSubject } from "../lib/email/weekly-report";
import type { IntelReport } from "../lib/report/build";
import { gradeFor } from "../lib/recommend/grade";

describe("email layout", () => {
  const html = renderEmail({
    preheader: "The hidden preview line",
    title: "Run it <script>alert(1)</script>",
    intro: "One sentence of context.",
    body: "<p>body</p>",
    cta: { label: "Open it", url: "https://usetrnd.com/app/report?week=2026-09-14" },
    footnote: "A quiet line.",
  });

  it("escapes a script in the title", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries the wordmark, the CTA url and the preheader", () => {
    expect(html).toContain(">TRND</span>");
    expect(html).toContain("#1ea7ae");
    expect(html).toContain('href="https://usetrnd.com/app/report?week=2026-09-14"');
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

describe("weekly report email", () => {
  const business = { id: "b", owner_id: "o", name: "glow room", city: "Atlanta", region: "GA", market: "online" } as unknown as Business;
  const note: IntelNote = {
    id: "n",
    business_id: "b",
    week_of: "2026-09-14",
    headline: "korean glass skin is the ad to run.",
    narrative: ["Because the read is up across three sources."],
    actions: ["Shoot the before-and-after on Tuesday."],
    model_used: "t",
    prompt_version: "t",
    created_at: "",
  };
  const report = {
    week: "2026-09-14",
    ranked: [
      { rank: 1, term: "korean glass skin facial", grade: gradeFor(8.4), score: 8.4, deltaPct: 47 },
      { rank: 2, term: "lymphatic drainage", grade: gradeFor(6.1), score: 6.1, deltaPct: null },
    ],
  } as unknown as IntelReport;

  it("contains the top pick's term in sentence case with its grade and delta", () => {
    const html = renderWeeklyReportEmail({ business, note, report, alerts: [] });
    expect(html).toContain("Korean glass skin facial");
    expect(html).not.toContain(">korean glass skin facial<");
    expect(html).toContain("Lymphatic drainage");
    expect(html).toContain("↑ 47%");
    expect(html).toContain("Open this week&#39;s report");
    expect(html).toContain("/app/report");
    expect(html).toContain("Korean glass skin is the ad to run.");
  });

  it("keeps the subject", () => {
    expect(weeklyReportSubject(business, note)).toBe("glow room — this week: korean glass skin is the ad to run");
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
