import { describe, expect, it } from "vitest";

import { reportEmailHtml } from "@/lib/email";
import type { ReportBody } from "@/lib/db/types";

const body = { headline: "AquaBliss is attacking on price.", summary: "They say $35 beats $150.", insights: [], rivals: [], opportunities: [] } as ReportBody;

describe("the report email", () => {
  it("carries the competitor ads our score ranks highest, with the creative and the receipts", () => {
    const html = reportEmailHtml({ name: "Jolie" }, body, [
      {
        rival: "Hello Klean",
        versions: 3,
        ad: { archive_id: "123", image_url: "https://img.example/a.jpg", hook: "Your shower deserves better water", body: null, title: "{{product.name}} on sale", started_at: "2026-09-01", stopped_at: null, active: true, score: 94, variants: 1 },
      },
    ]);
    expect(html).toContain("What they keep paying for");
    expect(html).toContain("Hello Klean");
    expect(html).toContain("Your shower deserves better water");
    expect(html).toContain("3 versions");
    expect(html).toContain("score 94");
    expect(html).toContain("https://img.example/a.jpg");
    expect(html).toContain("facebook.com/ads/library");
    expect(html).not.toContain("{{");
  });
  it("leaves the wall out when there is nothing to show", () => {
    expect(reportEmailHtml({ name: "Jolie" }, body)).not.toContain("What they keep paying for");
  });
});
