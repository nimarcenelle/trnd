import { inflateRawSync } from "node:zlib";

/** The largest essay file we read. A Word essay is a few dozen KB. */
export const MAX_ESSAY_FILE_BYTES = 5 * 1024 * 1024;

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
export const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
export const isDocx = isZip;

/** One file out of a zip (a .docx is one), found through the central directory. Null when it isn't there. */
export function unzipEntry(bytes: Uint8Array, name: string): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) return null;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const entry = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if (entry === name) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return new Uint8Array(inflateRawSync(data));
      return null;
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

/** A Word document's text, one line per paragraph. */
export function docxText(bytes: Uint8Array): string {
  const xml = unzipEntry(bytes, "word/document.xml");
  if (!xml) return "";
  const doc = new TextDecoder().decode(xml);
  const paragraphs = doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((p) => decodeXml((p.replace(/<w:tab\/>/g, " ").match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")))
    .join("\n");
}

/** Openings of the seven Common App prompts, which students often paste above the essay. */
const PROMPT_OPENINGS = [
  "some students have a background",
  "the lessons we take from obstacles",
  "reflect on a time when you questioned",
  "reflect on something that someone has done for you",
  "discuss an accomplishment, event, or realization",
  "describe a topic, idea, or concept you find so engaging",
  "share an essay on any topic of your choice",
];

/** The essay alone: blank lines and doubled spaces gone, and a Common App prompt at the top dropped. */
export function cleanEssay(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
  if (lines.length > 1 && PROMPT_OPENINGS.some((p) => lines[0].toLowerCase().startsWith(p))) lines.shift();
  return lines.join("\n\n");
}
