/**
 * Casing for display text. Data stays as entered (terms lowercase, names as
 * typed); display prints everything in sentence case: the first letter is
 * capitalized and the rest is left alone. Nothing is title-cased and
 * nothing a brand typed in lowercase stays lowercase on the page.
 */

/** Sentence case: capitalize the first letter character, leave the rest. */
export function sentenceCase(input: string): string {
  const i = input.search(/[a-zA-Z]/);
  if (i === -1) return input;
  return input.slice(0, i) + input[i].toUpperCase() + input.slice(i + 1);
}
