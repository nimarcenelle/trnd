/** Idempotent: normalizing an already-normalized term is a no-op —
 * underscores survive as separators, so double application (adapter output
 * fed through the ingest mapper) can't silently fork the key space. */
export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .trim()
    .replace(/[\s_]+/g, "_");
}
