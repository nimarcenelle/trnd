import type { Repo } from "@/lib/db/repo";
import { isTabular } from "@/lib/documents/parse";

/**
 * Ad exports hiding among the documents an owner uploads. Onboarding takes
 * "your menus and price lists" and owners upload whatever spreadsheet is
 * to hand, an Ads Manager export included; the documents pipeline turns
 * each into text (a spreadsheet becomes its CSV). The ad parser reads that
 * text back as bytes and decides, by its headers, whether it is an export.
 * A menu is not, and is left alone.
 */
export async function importAdExportsFromDocuments(
  repo: Repo,
  businessId: string,
  documents: { name: string; mime: string; text: string }[],
): Promise<number> {
  const tabular = documents.filter((d) => isTabular(d.mime) && d.text.trim().length > 0);
  if (tabular.length === 0) return 0;
  const { parseAdExport } = await import("@/lib/ads/import");
  let written = 0;
  const replaced = new Set<string>();
  for (const d of tabular) {
    let read: ReturnType<typeof parseAdExport>;
    try {
      read = parseAdExport({ name: d.name.replace(/\.(xlsx|xls)$/i, ".csv"), mime: "text/csv", bytes: new TextEncoder().encode(d.text) });
    } catch {
      continue;
    }
    if (!read.source || !read.platform || read.rows.length === 0) continue;
    // One export per platform replaces that platform's rows, as the Settings
    // import does, so an owner who uploads twice never double counts.
    if (!replaced.has(read.source)) {
      await repo.deleteAdHistory(businessId, { source: read.source });
      replaced.add(read.source);
    }
    written += await repo.upsertAdHistory(read.rows.map((r) => ({ ...r, business_id: businessId })));
  }
  return written;
}
