import * as XLSX from "xlsx";

import type { AdHistory, AdHistorySource, NewAdHistory } from "@/lib/db/types";

/**
 * The owner's own past ads, from the export they already know how to pull.
 *
 * Most owners who have run ads have never connected an ad account to
 * anything, but they can all click "Export" in Ads Manager or Google Ads.
 * That file is the brand signal's "what has worked for YOU", so this reads
 * it deterministically: no model, no guessing at columns it cannot name.
 *
 * Both platforms change their export columns every year or so and let the
 * owner pick which columns to include, so everything here is matched by
 * header name (case-insensitive, currency code stripped) and every metric is
 * optional. A file that is not an ad export gets a plain warning back, never
 * a throw: the upload screen shows the warning and the owner tries again.
 */

export type AdDraft = Omit<NewAdHistory, "business_id">;

export const MAX_AD_HISTORY_ROWS = 500;
/** Google Ads puts a report title and a date range above the header; some
 * saved reports add a filter line too. Twenty rows is generous. */
const HEADER_SCAN_ROWS = 20;
const COPY_MAX = 500;

export interface AdExportInput {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface AdExportRead {
  platform: AdHistory["platform"] | null;
  source: AdHistorySource | null;
  rows: AdDraft[];
  warnings: string[];
}

type Field =
  | "campaign"
  | "adset"
  | "ad"
  | "impressions"
  | "clicks"
  | "spend"
  | "results"
  | "ctr"
  | "start"
  | "end"
  | "headline"
  | "body";

type Aliases = Record<Field, string[]>;

// Alias order is preference order. For Meta, link clicks beat "Clicks (all)":
// "all" counts taps on the profile name and "see more", which inflate CTR
// against what the owner actually paid to get, a visit.
const META: Aliases = {
  campaign: ["campaign name"],
  adset: ["ad set name"],
  ad: ["ad name"],
  impressions: ["impressions"],
  clicks: ["link clicks", "clicks (all)"],
  spend: ["amount spent", "amount spent (usd)"],
  results: ["results"],
  ctr: ["ctr (link click-through rate)", "ctr (all)"],
  start: ["reporting starts", "day"],
  end: ["reporting ends"],
  headline: ["headline", "title", "ad creative title"],
  body: ["body", "ad creative body", "primary text"],
};

const GOOGLE: Aliases = {
  campaign: ["campaign"],
  adset: ["ad group"],
  ad: ["ad name"],
  impressions: ["impr.", "impressions", "impr"],
  clicks: ["clicks"],
  spend: ["cost"],
  results: ["conversions", "conv."],
  ctr: ["ctr"],
  start: ["day", "date", "start date"],
  end: ["end date"],
  headline: ["headline 1", "headline"],
  body: ["description", "description 1", "description line 1"],
};

const PLATFORMS = [
  { platform: "meta" as const, source: "meta_export" as const, label: "Meta Ads Manager", aliases: META },
  { platform: "google" as const, source: "google_export" as const, label: "Google Ads", aliases: GOOGLE },
];

const NOT_AN_EXPORT =
  "This doesn't look like an ad export. From Meta Ads Manager, export a report with Campaign name, Impressions and Amount spent. From Google Ads, download a campaign or ad report with Campaign, Impr. and Cost.";

/* ------------------------------ cell parsing ------------------------------ */

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).replace(/\s+/g, " ").trim();
}

/** "Amount spent (USD)" and "Cost (EUR)" name the same column as their bare
 * forms; the currency code is the account's, not the column's. */
function normalizeHeader(v: unknown): string {
  return cellText(v)
    .replace(/^﻿/, "")
    .replace(/\(\s*[A-Z]{3}\s*\)/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Both platforms write "--" or a blank for "no data", which is different
 * from zero and must stay null. */
function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = cellText(v);
  if (!s || /^(--?|n\/a|—)$/i.test(s)) return null;
  const t = s.replace(/[^\d.\-]/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

function parseCount(v: unknown): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n);
}

function parseCents(v: unknown): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n * 100);
}

/** "1.23%" is a percent. A bare number above 1 is too (Meta's XLSX stores
 * CTR as 1.23, not 0.0123); at or below 1 it is read as a fraction. The
 * ambiguous case rarely matters: CTR is recomputed from clicks and
 * impressions whenever the file has both. */
function parseCtr(v: unknown): number | null {
  const percent = typeof v === "string" && v.includes("%");
  const n = parseNumber(v);
  if (n === null || n < 0) return null;
  return percent || n > 1 ? n / 100 : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Spreadsheet serials, ISO, US m/d/y, and "Sep 1, 2026". Parsed by hand
 * rather than through Date so a timezone can never move a day. */
function parseDay(v: unknown): string | null {
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const d = XLSX.SSF.parse_date_code(v);
    return d ? ymd(d.y, d.m, d.d) : null;
  }
  const s = cellText(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) return ymd(Number(m[3]), Number(m[1]), Number(m[2]));
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mon ? ymd(Number(m[3]), mon, Number(m[2])) : null;
  }
  return null;
}

/* ------------------------------ file reading ------------------------------ */

function decodeText(bytes: Uint8Array): string {
  // Google Ads' "CSV (Excel)" download is UTF-16 with a BOM; everything
  // else is UTF-8, sometimes with a BOM Excel added on the way through.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
}

/** The separator is sniffed from the widest line, not the first: the first
 * line of a Google export is a one-cell report title. */
function sniffSeparator(text: string): string {
  const lines = text.split(/\r?\n/).slice(0, HEADER_SCAN_ROWS);
  let best = ",";
  let bestWidth = 0;
  for (const sep of [",", "\t", ";"]) {
    for (const line of lines) {
      let width = 1;
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === sep && !quoted) width++;
      }
      if (width > bestWidth) {
        bestWidth = width;
        best = sep;
      }
    }
  }
  return best;
}

function readGrids(input: AdExportInput): unknown[][][] {
  const b = input.bytes;
  const zip = b[0] === 0x50 && b[1] === 0x4b;
  const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  // Magic bytes over name and mime: owners rename files, and browsers report
  // CSVs as application/vnd.ms-excel on Windows.
  const wb =
    zip || ole
      ? XLSX.read(b, { type: "array" })
      : XLSX.read(decodeText(b), { type: "string", raw: true, FS: sniffSeparator(decodeText(b)) } as XLSX.ParsingOptions);
  return wb.SheetNames.map((name) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
  );
}

type Columns = Partial<Record<Field, number>>;

function mapColumns(headerRow: unknown[], aliases: Aliases): Columns {
  const headers = headerRow.map(normalizeHeader);
  const cols: Columns = {};
  for (const field of Object.keys(aliases) as Field[]) {
    for (const alias of aliases[field]) {
      const i = headers.indexOf(alias);
      if (i !== -1) {
        cols[field] = i;
        break;
      }
    }
  }
  return cols;
}

/** A header row has to name the campaign, the impressions, and at least one
 * of clicks or spend. Anything less is a sales report that happens to have a
 * column called "Campaign". */
function findHeader(grid: unknown[][]) {
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    for (const p of PLATFORMS) {
      const cols = mapColumns(grid[r] ?? [], p.aliases);
      if (cols.campaign !== undefined && cols.impressions !== undefined && (cols.clicks !== undefined || cols.spend !== undefined)) {
        return { ...p, cols, headerIndex: r };
      }
    }
  }
  return null;
}

/* --------------------------------- parse ---------------------------------- */

interface Acc {
  draft: AdDraft;
  ctrWeighted: number;
  ctrImpressions: number;
  firstReportedCtr: number | null;
  merged: number;
}

const add = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);

export function parseAdExport(input: AdExportInput): AdExportRead {
  const warnings: string[] = [];
  let grids: unknown[][][];
  try {
    grids = input.bytes.length > 0 ? readGrids(input) : [];
  } catch (err) {
    console.warn(`[ads:import] could not read "${input.name}":`, (err as Error).message);
    return { platform: null, source: null, rows: [], warnings: [`We couldn't open ${input.name || "that file"}. ${NOT_AN_EXPORT}`] };
  }

  let found: (ReturnType<typeof findHeader> & { grid: unknown[][] }) | null = null;
  for (const grid of grids) {
    const header = findHeader(grid);
    if (header) {
      found = { ...header, grid };
      break;
    }
  }
  if (!found) return { platform: null, source: null, rows: [], warnings: [NOT_AN_EXPORT] };

  const { cols, grid, headerIndex } = found;
  const at = (row: unknown[], f: Field) => (cols[f] === undefined ? null : row[cols[f]!]);

  const byKey = new Map<string, Acc>();
  let noDelivery = 0;
  for (let r = headerIndex + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const campaign = cellText(at(row, "campaign"));
    // Summary rows: Google writes "Total: Account", "Total: Campaigns";
    // Meta writes a totals row with the campaign cell left blank.
    if (!campaign || campaign === "--" || /^(grand )?total\b/i.test(campaign) || /^total\b/i.test(cellText(row[0]))) continue;

    const impressions = parseCount(at(row, "impressions"));
    const clicks = parseCount(at(row, "clicks"));
    const spend = parseCents(at(row, "spend"));
    if (!impressions && !clicks && !spend) {
      noDelivery++;
      continue;
    }

    // Google has no per-ad name, and a Meta export at the ad set level has
    // none either; the ad group or ad set name is the most specific label
    // left, and it is usually what the owner called the idea.
    const adName = cellText(at(row, "ad")) || cellText(at(row, "adset")) || null;
    const startedOn = parseDay(at(row, "start"));
    const endedOn = parseDay(at(row, "end"));
    const copyParts = [cellText(at(row, "headline")), cellText(at(row, "body"))].filter((s) => s && s !== "--");
    const copy = [...new Set(copyParts)].join(" ").slice(0, COPY_MAX) || null;
    const reportedCtr = parseCtr(at(row, "ctr"));

    // Same ad, same start: a placement or day breakdown of one ad. Summed so
    // an export with "Breakdown: placement" does not read as four ads.
    const key = `${campaign} ${adName ?? ""} ${startedOn ?? ""}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        draft: {
          platform: found.platform,
          campaign_name: campaign,
          ad_name: adName,
          copy,
          impressions,
          clicks,
          spend_cents: spend,
          results: parseNumber(at(row, "results")),
          ctr: null,
          started_on: startedOn,
          ended_on: endedOn,
          source: found.source,
        },
        ctrWeighted: reportedCtr !== null && impressions ? reportedCtr * impressions : 0,
        ctrImpressions: reportedCtr !== null && impressions ? impressions : 0,
        firstReportedCtr: reportedCtr,
        merged: 1,
      });
    } else {
      const d = prev.draft;
      d.impressions = add(d.impressions, impressions);
      d.clicks = add(d.clicks, clicks);
      d.spend_cents = add(d.spend_cents, spend);
      d.results = add(d.results, parseNumber(at(row, "results")));
      d.copy = d.copy ?? copy;
      if (endedOn && (!d.ended_on || endedOn > d.ended_on)) d.ended_on = endedOn;
      if (reportedCtr !== null && impressions) {
        prev.ctrWeighted += reportedCtr * impressions;
        prev.ctrImpressions += impressions;
      }
      prev.merged++;
    }
  }

  let rows = [...byKey.values()].map(({ draft, ctrWeighted, ctrImpressions, firstReportedCtr }) => ({
    ...draft,
    // Our own division beats the file's column: it matches the clicks we
    // stored, and it stays right after rows are summed.
    ctr:
      draft.impressions && draft.clicks !== null
        ? draft.clicks / draft.impressions
        : ctrImpressions > 0
          ? ctrWeighted / ctrImpressions
          : firstReportedCtr,
  }));

  if (noDelivery > 0) {
    warnings.push(`Skipped ${noDelivery} ${noDelivery === 1 ? "row" : "rows"} with no impressions, clicks or spend.`);
  }
  if (rows.length > MAX_AD_HISTORY_ROWS) {
    warnings.push(`This export has ${rows.length} ads. We kept the ${MAX_AD_HISTORY_ROWS} with the most impressions.`);
    // The ads that reached people are the ones with something to teach;
    // the long tail of test ads with 40 impressions is noise.
    rows = [...rows].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)).slice(0, MAX_AD_HISTORY_ROWS);
  }
  if (rows.length === 0) {
    warnings.push(`We found the ${found.label} columns, but no ads with any delivery in it. Check the date range and export again.`);
  }

  return { platform: found.platform, source: found.source, rows, warnings };
}
