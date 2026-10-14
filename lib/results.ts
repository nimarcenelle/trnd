/**
 * The brand's own ad results, from a Meta Ads Manager export (CSV, the
 * "Export table data" button). Column names vary with the columns the owner
 * chose and the account's currency, so each field is found by matching the
 * header loosely; a missing column is a missing number, never an error.
 */

export interface ParsedResult {
  ad_name: string;
  body: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  results: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  roas: number | null;
  period_start: string | null;
  period_end: string | null;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
};
const day = (v: string | undefined): string | null => (v && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ? v.trim().slice(0, 10) : null);

/** "actions:offsite_conversion.fb_pixel_purchase" → "purchase". */
function resultType(v: string | undefined): string | null {
  const t = (v ?? "")
    .trim()
    .replace(/^actions:/, "")
    .replace(/^(offsite_conversion\.fb_pixel_|onsite_conversion\.|offsite_conversion\.)/, "")
    .replace(/[._]/g, " ")
    .trim();
  return t || null;
}

/** The first header matching any pattern, in pattern order. */
function col(headers: string[], ...patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseAdsExport(text: string): ParsedResult[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const h = head.map((x) => x.trim().toLowerCase());
  const at = {
    name: col(h, /^ad name$/, /^ad$/, /ad name/),
    body: col(h, /^body/, /primary text/, /^ad body/),
    spend: col(h, /^amount spent/, /^spend/, /amount spent/),
    impressions: col(h, /^impressions$/),
    clicks: col(h, /^link clicks$/, /^clicks \(all\)$/, /^clicks$/),
    ctr: col(h, /^ctr \(link click-through rate\)$/, /^ctr \(all\)$/, /^ctr/),
    results: col(h, /^results$/, /^purchases$/),
    resultType: col(h, /^result indicator$/, /^result type$/),
    cpr: col(h, /^cost per result/, /^cost per purchase/),
    roas: col(h, /purchase roas/, /^roas/, /return on ad spend/),
    start: col(h, /^reporting starts$/, /^starts$/),
    end: col(h, /^reporting ends$/, /^ends$/),
  };
  if (at.name < 0) throw new Error("No “Ad name” column found. Export from Ads Manager at the Ads level.");
  const get = (r: string[], i: number) => (i >= 0 ? r[i] : undefined);
  return rows
    .map((r) => ({
      ad_name: (get(r, at.name) ?? "").trim(),
      body: get(r, at.body)?.trim() || null,
      spend: num(get(r, at.spend)),
      impressions: num(get(r, at.impressions)),
      clicks: num(get(r, at.clicks)),
      ctr: num(get(r, at.ctr)),
      results: num(get(r, at.results)),
      result_type: resultType(get(r, at.resultType)),
      cost_per_result: num(get(r, at.cpr)),
      roas: num(get(r, at.roas)),
      period_start: day(get(r, at.start)),
      period_end: day(get(r, at.end)),
    }))
    // Ads Manager adds a totals row with no ad name.
    .filter((r) => r.ad_name && !/^total/i.test(r.ad_name));
}

/** Best and worst by cost per result, among ads with real spend: about a third each, at most three. */
export function rankResults<T extends Pick<ParsedResult, "spend" | "cost_per_result" | "results">>(rows: T[]): { best: T[]; worst: T[] } {
  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const floor = Math.max(1, totalSpend * 0.02);
  const scored = rows.filter((r) => (r.spend ?? 0) >= floor && r.cost_per_result !== null && (r.results ?? 0) > 0);
  const sorted = [...scored].sort((a, b) => a.cost_per_result! - b.cost_per_result!);
  const k = Math.min(3, Math.max(1, Math.round(sorted.length / 3)));
  if (sorted.length < 2) return { best: sorted, worst: [] };
  return { best: sorted.slice(0, k), worst: sorted.slice(-k).reverse() };
}
