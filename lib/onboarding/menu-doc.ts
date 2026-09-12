import type { DocumentDigest } from "@/lib/db/types";

/**
 * A menu or price list read during onboarding, before the business exists.
 * It rides through the wizard as a hidden field and is saved as the
 * business's first document the moment the business is created.
 */
export interface OnboardingDocument {
  name: string;
  mime: string;
  text: string;
  digest: DocumentDigest;
  model_used: string;
}

/** How much of a document's text the onboarding form carries — the brief
 * reads it alongside the site text, so it's capped like the site text. */
export const MAX_ONBOARDING_DOC_TEXT = 40_000;

export interface ServiceRow {
  name: string;
  price: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Dollars as typed in the wizard ("7", "24.50") from stored cents. */
export function priceFromCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/**
 * Fold what a menu document found into the rows the owner already has:
 * an unpriced row whose name matches (either name contains the other) takes
 * the document's price; new items are appended with theirs. Rows the owner
 * typed are never renamed or overwritten, and the empty placeholder row
 * makes way for real items.
 */
export function mergeServices(rows: ServiceRow[], found: DocumentDigest["services_found"]): ServiceRow[] {
  const out = rows.map((r) => ({ ...r }));
  const taken = new Set<number>();
  const additions: ServiceRow[] = [];
  for (const f of found) {
    const fname = f.name.trim();
    if (!fname) continue;
    const fk = norm(fname);
    if (!fk) continue;
    const idx = out.findIndex((r, i) => {
      if (taken.has(i)) return false;
      const rk = norm(r.name);
      return rk.length > 0 && (rk === fk || rk.includes(fk) || fk.includes(rk));
    });
    const price = priceFromCents(f.price_cents);
    if (idx >= 0) {
      taken.add(idx);
      if (!out[idx].price.trim() && price) out[idx].price = price;
    } else if (!additions.some((a) => norm(a.name) === fk)) {
      additions.push({ name: fname.slice(0, 80), price });
    }
  }
  const merged = [...out, ...additions].filter((r) => r.name.trim() || r.price.trim());
  if (merged.length > 40) merged.length = 40;
  return merged.length > 0 ? merged : [{ name: "", price: "" }];
}
