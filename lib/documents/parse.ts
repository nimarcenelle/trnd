import type { DocumentDigest, DocumentKind } from "@/lib/db/types";

/** What can be uploaded, by extension → mime. PDFs are read by the model;
 * everything else is text TRND can read on its own. */
export const ACCEPTED: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  tsv: "text/tab-separated-values",
};
export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENTS = 10;
/** Stored text is capped — the digest is what gets read week to week. */
export const MAX_TEXT = 80_000;

export function mimeFor(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ACCEPTED[ext] ?? null;
}

export const isPdf = (mime: string) => mime === "application/pdf";

/** Text-like uploads decode straight to text; PDFs need the model. */
export function extractText(mime: string, bytes: Uint8Array): string | null {
  if (isPdf(mime)) return null;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\r\n?/g, "\n").slice(0, MAX_TEXT);
}

/* ------------------------------ CSV reading ------------------------------ */

function splitRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const toNumber = (v: string): number | null => {
  const t = v.replace(/[$,%\s]/g, "");
  if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

export interface CsvRead {
  columns: string[];
  rows: number;
  facts: string[];
}

/**
 * A sales/POS export, read deterministically: the columns, the row count,
 * the top rows by the most money-like numeric column, and its total. Enough
 * for "your top sellers are…" without a model; the model adds nuance.
 */
export function readCsv(text: string, sep = text.includes("\t") && !text.includes(",") ? "\t" : ","): CsvRead | null {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const columns = splitRow(lines[0], sep);
  if (columns.length < 2) return null;
  const rows = lines.slice(1, 5001).map((l) => splitRow(l, sep));
  const numericShare = columns.map((_, i) => rows.filter((r) => toNumber(r[i] ?? "") !== null).length / rows.length);
  const numericCols = columns.map((c, i) => ({ c, i })).filter(({ i }) => numericShare[i] >= 0.8);
  const nameCol = columns.findIndex((_, i) => numericShare[i] < 0.5);
  const facts: string[] = [`${fmt(rows.length)} rows, columns: ${columns.join(", ")}.`];
  if (numericCols.length === 0 || nameCol === -1) return { columns, rows: rows.length, facts };
  const moneyLike = numericCols.find(({ c }) => /revenue|sales|total|amount|net|gross|price|\$/i.test(c)) ?? numericCols.find(({ c }) => /qty|quantity|count|units|orders|sold/i.test(c)) ?? numericCols[0];
  const sums = new Map<string, number>();
  for (const r of rows) {
    const key = (r[nameCol] ?? "").trim();
    const v = toNumber(r[moneyLike.i] ?? "");
    if (!key || v === null) continue;
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  const ranked = [...sums.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, v]) => a + v, 0);
  if (ranked.length > 0) {
    facts.push(`Top by ${moneyLike.c}: ${ranked.slice(0, 5).map(([k, v]) => `${k} (${fmt(v)})`).join(", ")}.`);
    facts.push(`Total ${moneyLike.c} across ${ranked.length} ${columns[nameCol].toLowerCase()} values: ${fmt(total)}.`);
    const last = ranked.slice(-3).reverse();
    if (ranked.length > 8) facts.push(`Bottom by ${moneyLike.c}: ${last.map(([k, v]) => `${k} (${fmt(v)})`).join(", ")}.`);
  }
  return { columns, rows: rows.length, facts };
}

/* --------------------------- deterministic digest --------------------------- */

const PRICE_LINE = /^(.{2,70}?)\s*(?:[-–—:.]+|\.{2,})?\s*\$\s?(\d{1,5}(?:\.\d{2})?)\s*(?:\/.*|\(.*\))?\s*$/;

export function guessKind(name: string, text: string, columns?: string[]): DocumentKind {
  const n = name.toLowerCase();
  const head = text.slice(0, 4000).toLowerCase();
  const cols = (columns ?? []).join(" ").toLowerCase();
  if (/impression|ctr|click|cpc|cpm|ad spend|campaign/.test(cols) || /impressions|ctr|cost per/.test(head) && /campaign|ad set/.test(head)) return "results";
  if (/qty|quantity|revenue|sales|sold|order|sku|net|gross/.test(cols) || /\breceipt|pos export|z-report/.test(n)) return "sales";
  if (/review|rating|stars?/.test(cols) || /review/.test(n) || (head.match(/★|stars|reviewed|would recommend/g)?.length ?? 0) >= 3) return "reviews";
  if (/brand|voice|tone|style guide|logo|guidelines/.test(n) || /brand voice|tone of voice|our story|mission/.test(head)) return "brand";
  if (/menu|price ?list|services|rates|pricing/.test(n) || (text.match(/\$\s?\d/g)?.length ?? 0) >= 5) return "menu";
  return "other";
}

export function servicesFromText(text: string): { name: string; price_cents: number | null }[] {
  const out: { name: string; price_cents: number | null }[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const m = raw.trim().match(PRICE_LINE);
    if (!m) continue;
    const name = m[1].replace(/[\s.…]+$/g, "").replace(/\s{2,}/g, " ").trim();
    if (name.length < 2 || /^\d/.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name: name.slice(0, 80), price_cents: Math.round(Number(m[2]) * 100) });
    if (out.length >= 40) break;
  }
  return out;
}

/** The keyless digest: what can be said from the text alone, honestly. */
export function fallbackDigest(name: string, mime: string, text: string | null): DocumentDigest {
  if (text === null || text.trim() === "") {
    return {
      kind: "other",
      summary: isPdf(mime)
        ? "A PDF. It's kept, and will be read as soon as document reading is available for your workspace."
        : "Nothing readable was found in this file.",
      facts: [],
      services_found: [],
      watchouts: [],
    };
  }
  const csv = /csv|tab-separated/.test(mime) ? readCsv(text) : null;
  const kind = guessKind(name, text, csv?.columns);
  const services = kind === "menu" || kind === "other" ? servicesFromText(text) : [];
  const facts: string[] = [];
  if (csv) facts.push(...csv.facts);
  else {
    // Lines that carry a number or a price are the citable ones.
    for (const l of text.split("\n").map((x) => x.trim()).filter((x) => x.length >= 12 && x.length <= 160 && /\d/.test(x))) {
      facts.push(l);
      if (facts.length >= 8) break;
    }
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  const what: Record<DocumentKind, string> = {
    menu: `A menu or price list${services.length ? ` — ${services.length} priced item${services.length === 1 ? "" : "s"} found` : ""}.`,
    sales: `A sales export${csv ? ` — ${fmt(csv.rows)} rows` : ""}.`,
    reviews: "Customer reviews — their own words, usable as hooks.",
    brand: "A brand or voice document — rules the copy should follow.",
    results: "Past ad or campaign results.",
    other: `A ${fmt(words)}-word document.`,
  };
  return {
    kind,
    summary: what[kind],
    facts: facts.slice(0, 12),
    services_found: services,
    watchouts: [],
  };
}
