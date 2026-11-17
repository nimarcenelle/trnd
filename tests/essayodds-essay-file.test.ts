import { readFileSync, existsSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { cleanEssay, docxText, unzipEntry } from "@/lib/essayodds/essay-file-core";

/** A one-file zip, deflated, built by hand. */
function zip(name: string, body: string): Uint8Array {
  const data = deflateRawSync(Buffer.from(body));
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = 30 + n.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return new Uint8Array(Buffer.concat([local, n, data, central, n, end]));
}

describe("essay files", () => {
  it("reads paragraphs out of a Word document", () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>She wore black shoes.</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Tom &amp; Jerry </w:t></w:r><w:r><w:t>laughed.</w:t></w:r></w:p></w:body></w:document>';
    const file = zip("word/document.xml", xml);
    expect(unzipEntry(file, "missing.xml")).toBeNull();
    expect(docxText(file)).toBe("She wore black shoes.\nTom & Jerry laughed.");
  });

  it("drops a Common App prompt pasted above the essay", () => {
    const text = "Discuss an accomplishment, event, or realization that sparked a period of personal growth.\n\nShe wore  black shoes.\n\nThen it rained.";
    expect(cleanEssay(text)).toBe("She wore black shoes.\n\nThen it rained.");
    expect(cleanEssay("Just one line.")).toBe("Just one line.");
  });

  const sample = "/Users/nicholasmarcenelle/Downloads/CommonApp Essay.docx";
  it.skipIf(!existsSync(sample))("reads a real Common App essay", () => {
    const essay = cleanEssay(docxText(new Uint8Array(readFileSync(sample))));
    expect(essay.startsWith("She wore black shoes")).toBe(true);
    expect(essay.split(/\s+/).length).toBeGreaterThan(600);
  });
});
