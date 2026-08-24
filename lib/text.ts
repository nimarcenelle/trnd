/** Casing helpers for display text. Data stays lowercase; display dresses up. */

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on",
  "or", "per", "the", "to", "vs", "via",
]);

/** Title Case for term-style titles: "korean glass skin facial" → "Korean Glass Skin Facial". */
export function titleCase(input: string): string {
  const words = input.split(/\s+/);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i !== 0 && i !== words.length - 1 && SMALL_WORDS.has(lower)) return lower;
      // Preserve leading punctuation like quotes or ↑
      const m = lower.match(/^([^a-z0-9]*)(.)(.*)$/);
      if (!m) return word;
      return m[1] + m[2].toUpperCase() + m[3];
    })
    .join(" ");
}

/** Sentence case: capitalize the first letter character, leave the rest. */
export function sentenceCase(input: string): string {
  const i = input.search(/[a-zA-Z]/);
  if (i === -1) return input;
  return input.slice(0, i) + input[i].toUpperCase() + input.slice(i + 1);
}
