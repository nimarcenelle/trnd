import { createHash } from "node:crypto";

import { z } from "zod";

import { quotedIn } from "./review-core";

/**
 * Pure rules for reviewing a Common App activity or honors list. A model grades each entry on three described bands and
 * proposes a tighter version; the score, the weakest entry and every check on the rewrite are worked out here. An entry
 * the model quotes has to exist in what was pasted, and a rewrite has to fit the Common App field and keep its numbers.
 */
export const LISTS_VERSION = "1";
export type ListKind = "activities" | "honors";
export const parseKind = (value: unknown): ListKind => (value === "honors" ? "honors" : "activities");

/** The Common App field a rewrite has to fit: an activity's description, an honor's title. */
export const FIELD_LIMIT: Record<ListKind, number> = { activities: 150, honors: 100 };
export const MAX_INPUT = 6000;

export const LIST_CRITERIA: Record<ListKind, { id: "a" | "b" | "c"; label: string; bands: string }[]> = {
  activities: [
    { id: "a", label: "Impact", bands: "1: says only what the activity is. 3: names a role or a result, without scale. 5: a concrete result with its scale (people, money, hours, rank) that the student caused." },
    { id: "b", label: "Specificity", bands: "1: generic duties any member has. 3: some specifics mixed with filler. 5: every phrase is particular to this student's work." },
    { id: "c", label: "Clarity", bands: "1: hard to follow or wastes characters on filler. 3: clear but loose. 5: tight, strong verbs first, no wasted characters." },
  ],
  honors: [
    { id: "a", label: "Scope", bands: "1: no level or field given. 3: level given (school, state, national, international) but the field is vague. 5: level and field both clear at a glance." },
    { id: "b", label: "Selectivity", bands: "1: no sign of how many competed or were chosen. 3: implied by the name only. 5: states how selective it was (top N, 1 of N, percentile) where the student knows it." },
    { id: "c", label: "Clarity", bands: "1: an acronym or internal name a reader won't know. 3: understandable with effort. 5: plain to an outside reader in one pass." },
  ],
};

const Band = z.number().int().min(1).max(5);
export const ListReply = z.object({
  entries: z
    .array(
      z.object({
        name: z.string().describe("A short label for the entry, 2 to 6 words."),
        quote: z.string().describe("The entry exactly as pasted, or its longest unique line, copied character for character."),
        grades: z.object({ a: Band, b: Band, c: Band }),
        fix: z.string().describe("One sentence: the single change that would most improve this entry."),
        rewrite: z.string().describe("A tighter version, using only facts in the entry. Empty if it is already as strong as it can be."),
      }),
    ),
});
export type ListReply = z.infer<typeof ListReply>;

export type ListEntry = {
  name: string;
  quote: string;
  score: number;
  grades: { label: string; grade: number }[];
  fix: string;
  /** Empty when the rewrite was missing, over the field limit, or added a number the entry did not have. */
  rewrite: string;
  rewriteLength: number;
};
export type ListReview = { kind: ListKind; limit: number; entries: ListEntry[]; weakest: number | null };

export function listSystem(kind: ListKind): string {
  const noun = kind === "activities" ? "activity list" : "honors list";
  const field = kind === "activities" ? "an activity description" : "an honor title";
  return `You review a student's Common App ${noun} the way a selective admissions reader skims one: fast, looking for what this student actually did.
Grade every entry on three criteria, each on the described 1 to 5 band:
${LIST_CRITERIA[kind].map((c) => `- ${c.id} (${c.label}): ${c.bands}`).join("\n")}
For each entry also give one fix, and a rewrite that fits ${field} (${FIELD_LIMIT[kind]} characters at most). The rewrite may only use facts, names and numbers in that entry: never add a number, a result or a title. If the entry is already as strong as it can be, leave the rewrite empty.
Quote each entry exactly as it was pasted. List the entries in the order they appear. Skip headings and anything that is not an entry.`;
}

export const listPrompt = (kind: ListKind, text: string) => `${kind === "activities" ? "Activity list" : "Honors list"}:\n\n${text}`;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function listKey(kind: ListKind, text: string): string {
  return "lists:" + createHash("sha256").update([LISTS_VERSION, kind, clean(text)].join("|")).digest("hex");
}

/** Every number in the rewrite must already be in the entry, so a tighter line can't invent a result. */
export const numbersKept = (entry: string, rewrite: string) => (rewrite.match(/\d[\d,.]*/g) ?? []).every((n) => entry.includes(n.replace(/[.,]$/, "")));

export function buildListReview(kind: ListKind, text: string, reply: ListReply): ListReview {
  const limit = FIELD_LIMIT[kind];
  const entries = reply.entries
    .slice(0, 12)
    .filter((e) => quotedIn(text, e.quote))
    .map((e) => {
      const grades = LIST_CRITERIA[kind].map((c) => ({ label: c.label, grade: e.grades[c.id] }));
      const score = Math.round((grades.reduce((sum, g) => sum + (g.grade - 1), 0) / (grades.length * 4)) * 100);
      const rewrite = clean(e.rewrite);
      const usable = rewrite.length > 0 && rewrite.length <= limit && numbersKept(e.quote, rewrite) && clean(e.quote) !== rewrite;
      return { name: e.name.trim(), quote: e.quote.trim(), score, grades, fix: e.fix.trim(), rewrite: usable ? rewrite : "", rewriteLength: usable ? rewrite.length : 0 };
    });
  let weakest: number | null = null;
  entries.forEach((e, i) => {
    if (weakest === null || e.score < entries[weakest].score) weakest = i;
  });
  return { kind, limit, entries, weakest };
}
