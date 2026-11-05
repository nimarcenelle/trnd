/** Splits an essay into plain runs and runs matching cited lines, so a review can mark them in place. */
export type Mark = { id: string; quote: string };
export type Segment = { text: string; id: string | null };

const pattern = (quote: string) =>
  quote
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
    .replace(/['‘’]/g, "['‘’]")
    .replace(/["“”]/g, '["“”]')
    .replace(/[–—-]/g, "[–—-]");

export function segments(text: string, marks: Mark[]): Segment[] {
  const found = marks
    .filter((m) => m.quote.trim())
    .flatMap((m) => {
      const match = new RegExp(pattern(m.quote), "i").exec(text);
      return match ? [{ id: m.id, start: match.index, end: match.index + match[0].length }] : [];
    })
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const m of found) {
    if (m.start < at) continue; // Two notes on overlapping lines: the earlier one keeps the mark.
    if (m.start > at) out.push({ text: text.slice(at, m.start), id: null });
    out.push({ text: text.slice(m.start, m.end), id: m.id });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), id: null });
  return out;
}
