import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-docs-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { extractText, fallbackDigest, guessKind, mimeFor, readCsv, servicesFromText } = await import("../lib/documents/parse");
const XLSX = await import("xlsx");
const { digestUpload, documentFacts } = await import("../lib/documents/digest");
const { buildIntelReport } = await import("../lib/report/build");
const { reportFacts } = await import("../lib/report/note");

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Glow Room",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 12,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
});

const SALES = `Item,Qty,Revenue
Glass skin facial,42,"5,880"
Brow lamination,31,"2,635"
Dermaplaning,12,"1,320"
Gift card,9,900
LED add-on,55,"1,100"
`;

const MENU = `GLOW ROOM — SERVICES
Glass skin facial ........ $140
Brow lamination — $85
Dermaplaning: $110 (45 min)
Walk-ins welcome, Tuesday to Saturday.
`;

describe("reading uploads without a model", () => {
  it("reads a sales export into top sellers and totals", () => {
    const csv = readCsv(SALES)!;
    expect(csv.rows).toBe(5);
    expect(csv.columns).toEqual(["Item", "Qty", "Revenue"]);
    expect(csv.facts[1]).toBe("Top by Revenue: Glass skin facial (5,880), Brow lamination (2,635), Dermaplaning (1,320), LED add-on (1,100), Gift card (900).");
    expect(csv.facts[2]).toBe("Total Revenue across 5 item values: 11,835.");
    expect(guessKind("q3-sales.csv", SALES, csv.columns)).toBe("sales");
  });

  it("finds priced items on a menu and calls it a menu", () => {
    expect(servicesFromText(MENU)).toEqual([
      { name: "Glass skin facial", price_cents: 14000 },
      { name: "Brow lamination", price_cents: 8500 },
      { name: "Dermaplaning", price_cents: 11000 },
    ]);
    const d = fallbackDigest("fall menu.txt", "text/plain", MENU);
    expect(d.kind).toBe("menu");
    expect(d.services_found.length).toBe(3);
    expect(d.summary).toContain("3 priced items found");
  });

  it("reads an Excel workbook as a sales table", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Item", "Qty", "Revenue"],
        ["Glass skin facial", 42, 5880],
        ["Brow lamination", 31, 2635],
      ]),
      "Q3",
    );
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const mime = mimeFor("q3.xlsx")!;
    const text = (await extractText(mime, bytes))!;
    expect(text.startsWith("Item,Qty,Revenue")).toBe(true);
    const d = fallbackDigest("q3.xlsx", mime, text);
    expect(d.kind).toBe("sales");
    expect(d.facts[1]).toBe("Top by Revenue: Glass skin facial (5,880), Brow lamination (2,635).");
  });

  it("keeps a PDF but says it can't read it yet", () => {
    const d = fallbackDigest("menu.pdf", "application/pdf", null);
    expect(d.kind).toBe("other");
    expect(d.facts).toEqual([]);
    expect(d.summary).toMatch(/document reading is available/);
    expect(mimeFor("menu.PDF")).toBe("application/pdf");
    expect(mimeFor("menu.docx")).toContain("wordprocessingml");
    expect(mimeFor("menu.pages")).toBeNull();
  });
});

describe("what the owner uploaded rides on every read", () => {
  beforeEach(() => resetStore());

  it("stores the digest, cites it in the report facts, and is private to the business", async () => {
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(bizInput("owner"));
    const read = await digestUpload(biz, { name: "q3-sales.csv", mime: "text/csv", bytes: new TextEncoder().encode(SALES) });
    expect(read.model_used).toBe("trnd-template/v1");
    const doc = await user.createDocument({ business_id: biz.id, name: "q3-sales.csv", mime: "text/csv", bytes: SALES.length, ...read });
    expect(doc.digest.kind).toBe("sales");

    const facts = documentFacts([doc]);
    expect(facts[1]).toBe('From "q3-sales.csv" (sales): Top by Revenue: Glass skin facial (5,880), Brow lamination (2,635), Dermaplaning (1,320), LED add-on (1,100), Gift card (900).');
    const report = await buildIntelReport(user, biz);
    expect(report.documents.length).toBe(3);
    expect(reportFacts(report)).toContain('From "q3-sales.csv" (sales): Top by Revenue');

    const stranger = createDemoRepo({ kind: "user", userId: "someone-else" });
    expect(await stranger.listDocuments(biz.id)).toEqual([]);
    await expect(stranger.deleteDocument(doc.id)).rejects.toThrow(/ownership/);
    await user.deleteDocument(doc.id);
    expect(await user.listDocuments(biz.id)).toEqual([]);
  });
});
