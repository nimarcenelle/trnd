import { z } from "zod";

import type { CreativeBrief, PickBeat, PickDirection } from "@/lib/db/types";

import { plainText, pricesMentioned } from "./schema";

/**
 * The creative test as the writer returns it, and the rules that decide
 * whether it can be stored.
 *
 * The rules separate evidence from judgment. The writer's judgments (the
 * hypothesis, the hooks, the script) are stored as written and labeled as
 * hypotheses on the page. The writer's facts (approved_facts, any number or
 * price anywhere) must trace to something the brand handed over or something
 * the evidence rows already say; a fact that traces to nothing fails the
 * whole draft, and the retry is told which one.
 */

/** ct-2: the brief dictates its first three seconds (opening beats). */
export const CONCEPT_VERSION = "ct-2";
export const OPENING_BEATS_MIN = 2;
export const OPENING_BEATS_MAX = 4;
export const HOOK_ALTERNATIVES_MAX = 3;
export const UNKNOWNS_MAX = 5;
export const SHOT_LIST_MAX = 7;
export const APPROVED_FACTS_MAX = 6;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const DirectionSchema = z.object({
  show: text(20, 400),
  say: text(20, 400),
  prove: text(10, 400),
});

const BeatSchema = z.object({
  visual: text(8, 240),
  on_screen_text: z.string().max(120).default(""),
  vo: z.string().max(240).default(""),
});

export const ConceptWriteSchema = z.object({
  title: text(4, 90),
  situation: text(20, 400),
  hypothesis: text(20, 500),
  unknowns: z.array(text(5, 200)).max(UNKNOWNS_MAX).default([]),
  differs_from: z.string().max(300).nullish(),
  format: text(3, 80),
  hooks: z.object({
    primary: text(6, 140),
    alternatives: z.array(text(6, 140)).max(HOOK_ALTERNATIVES_MAX).default([]),
  }),
  script: z.object({
    direction: DirectionSchema,
    cta: text(3, 120),
    duration_seconds: z.number().min(5).max(90),
  }),
  /** The first three seconds, shot by shot. Nullable so a brief written
   * before ct-2 still parses; the model is told it is required. */
  opening: z.object({ beats: z.array(BeatSchema).min(OPENING_BEATS_MIN).max(OPENING_BEATS_MAX) }).nullish(),
  shot_list: z.array(text(5, 200)).min(2).max(SHOT_LIST_MAX),
  approved_facts: z.array(text(5, 200)).min(1).max(APPROVED_FACTS_MAX),
  outcomes: z.object({
    if_better: text(10, 300),
    if_same: text(10, 300),
    if_worse: text(10, 300),
  }),
  priority_reason: text(10, 240),
  guardrail: z.string().max(360).nullish(),
});

export type ConceptWriteRaw = z.infer<typeof ConceptWriteSchema>;

export interface ConceptWrite {
  title: string;
  situation: string;
  hypothesis: string;
  unknowns: string[];
  differs_from: string | null;
  format: string;
  hooks: { primary: string; alternatives: string[] };
  script: { direction: PickDirection; cta: string; duration_seconds: number };
  /** The first three seconds, shot by shot; the first beat says the hook. */
  opening?: { beats: PickBeat[] } | null;
  shot_list: string[];
  approved_facts: string[];
  outcomes: { if_better: string; if_same: string; if_worse: string };
  priority_reason: string;
  guardrail: string | null;
}

/** What the validator is allowed to trust. Everything else is invented. */
export interface ConceptRules {
  /** The research term the concept came from. */
  term: string;
  /** Text the brand handed over or TRND observed: catalog names and
   * descriptions, the evidence claims, the owner's claims notes, the
   * brand voice notes. Facts must trace here. */
  corpus: string[];
  /** Prices the copy may name, in cents. */
  allowedPriceCents: number[];
  /** Words the owner said never to use, when they gave any. */
  forbiddenPhrases?: string[];
}

/* -------------------------------- words ---------------------------------- */

const STOP = new Set(
  "the a an and or but of to in on at for with from by as is are was were be been being it its this that these those your you our we they them their there here not no yes into over under about after before than then so if then when while where which who whom what why how can could may might will would shall should do does did done have has had having more most less least very just only also any some all each every both few many much such own same other another one two three four five six seven eight nine ten first second next last new now".split(
    " ",
  ),
);

/** Content words: lowercase, three letters or more, plural-blind, minus stopwords. */
export function contentWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Jaccard overlap of two texts' content words, 0..1. */
export function wordOverlap(a: string, b: string): number {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared);
}

/* ------------------------------- numbers --------------------------------- */

/** Small counts read as description ("two seconds", "3 shots"), not as claims. */
const SMALL_COUNT_MAX = 12;

/** Every figure a text states that could be a claim: percentages, dollar
 * amounts, and any number above a small count. */
export function claimNumbers(text: string): { percents: number[]; dollars: number[]; numbers: number[] } {
  const percents = [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => Number(m[1]));
  const dollars = pricesMentioned(text);
  const numbers = [...text.replace(/(\d+(?:\.\d+)?)\s?%/g, " ").replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, " ").matchAll(/\b(\d[\d,]*(?:\.\d+)?)\b/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > SMALL_COUNT_MAX);
  return { percents, dollars, numbers };
}

function corpusNumbers(corpus: string[]): { percents: Set<number>; numbers: Set<number> } {
  const percents = new Set<number>();
  const numbers = new Set<number>();
  for (const line of corpus) {
    const c = claimNumbers(line);
    for (const p of c.percents) percents.add(p);
    for (const n of c.numbers) numbers.add(n);
    for (const d of c.dollars) numbers.add(d);
  }
  return { percents, numbers };
}

/**
 * Whether a fact traces to the corpus: every figure in it appears somewhere
 * in the corpus, and most of its content words do. Loose on purpose: the
 * corpus is the brand's own words and TRND's own observations, and a fact
 * restated in other words still traces. A fact about a "30-day guarantee"
 * with no 30 anywhere on file does not.
 */
export function factSupported(fact: string, corpus: string[]): boolean {
  const words = new Set(corpus.flatMap(contentWords));
  const have = corpusNumbers(corpus);
  const c = claimNumbers(fact);
  if (c.percents.some((p) => !have.percents.has(p))) return false;
  if ([...c.numbers, ...c.dollars].some((n) => !have.numbers.has(n))) return false;
  const fw = contentWords(fact);
  if (fw.length === 0) return false;
  const shared = fw.filter((w) => words.has(w)).length;
  return shared * 2 >= fw.length;
}

/* ------------------------------ the validator ---------------------------- */

const ALLOWED_TEXT_FIELDS: [string, (v: ConceptWriteRaw) => string][] = [
  ["title", (v) => v.title],
  ["situation", (v) => v.situation],
  ["hypothesis", (v) => v.hypothesis],
  ["hooks.primary", (v) => v.hooks.primary],
  ["script.direction.show", (v) => v.script.direction.show],
  ["script.direction.say", (v) => v.script.direction.say],
  ["script.direction.prove", (v) => v.script.direction.prove],
  ["script.cta", (v) => v.script.cta],
  ["priority_reason", (v) => v.priority_reason],
  ["outcomes.if_better", (v) => v.outcomes.if_better],
  ["outcomes.if_same", (v) => v.outcomes.if_same],
  ["outcomes.if_worse", (v) => v.outcomes.if_worse],
];

const RESULT_WORDS = /\b(guarantee[ds]?|proven|clinically|cures?|treats?|prevents?|will (?:double|triple|boost|increase)|roas|conversion rate will)\b/i;

export function conceptSchemaFor(rules: ConceptRules) {
  const term = rules.term.trim().toLowerCase();
  const allowedDollars = rules.allowedPriceCents.filter((c) => c > 0).map((c) => c / 100);
  const have = corpusNumbers(rules.corpus);
  const forbidden = (rules.forbiddenPhrases ?? []).map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 3);

  return ConceptWriteSchema.superRefine((v, issue) => {
    // The title names a concept, not the search term.
    if (v.title.trim().toLowerCase() === term || contentWords(v.title).length < 2) {
      issue.addIssue({ code: "custom", path: ["title"], message: "the title must name a creative concept, not repeat the search term" });
    }
    // Hooks never lead with a price, and never carry a figure of their own.
    const hooks = [v.hooks.primary, ...v.hooks.alternatives];
    hooks.forEach((h, i) => {
      const c = claimNumbers(h);
      if (c.dollars.length > 0 || c.percents.length > 0 || c.numbers.length > 0) {
        issue.addIssue({ code: "custom", path: i === 0 ? ["hooks", "primary"] : ["hooks", "alternatives", i - 1], message: "a hook carries no price, percentage or figure" });
      }
    });
    const seen = new Set<string>();
    for (const h of hooks) {
      const k = h.trim().toLowerCase();
      if (seen.has(k)) issue.addIssue({ code: "custom", path: ["hooks", "alternatives"], message: "each hook alternative must differ from the primary and from each other" });
      seen.add(k);
    }
    // Every figure anywhere else traces to the corpus or to a listed price.
    for (const [path, read] of ALLOWED_TEXT_FIELDS) {
      const s = read(v);
      const c = claimNumbers(s);
      const badPct = c.percents.find((p) => !have.percents.has(p));
      if (badPct !== undefined) {
        issue.addIssue({ code: "custom", path: path.split("."), message: `states ${badPct}% which nothing on file supports; numbers must not be invented` });
      }
      const badDollar = c.dollars.find((d) => !allowedDollars.some((a) => Math.abs(a - d) <= 0.5) && !have.numbers.has(d));
      if (badDollar !== undefined) {
        issue.addIssue({ code: "custom", path: path.split("."), message: `names $${badDollar}, which is not a listed price` });
      }
      const badNumber = c.numbers.find((n) => !have.numbers.has(n));
      if (badNumber !== undefined) {
        issue.addIssue({ code: "custom", path: path.split("."), message: `states the figure ${badNumber}, which nothing on file supports` });
      }
      if (RESULT_WORDS.test(s)) {
        issue.addIssue({ code: "custom", path: path.split("."), message: "promises a result (guaranteed, proven, cures, will boost); a test is a hypothesis, not a promise" });
      }
      const hit = forbidden.find((p) => s.toLowerCase().includes(p));
      if (hit) issue.addIssue({ code: "custom", path: path.split("."), message: `uses "${hit}", which the brand said never to use` });
    }
    // Approved facts are the only place a claim may live, and each traces.
    v.approved_facts.forEach((f, i) => {
      if (!factSupported(f, rules.corpus)) {
        issue.addIssue({ code: "custom", path: ["approved_facts", i], message: `"${f.slice(0, 60)}" is not on the product pages, the catalog, the owner's notes or the evidence; drop it or restate a fact that is` });
      }
      const hit = forbidden.find((p) => f.toLowerCase().includes(p));
      if (hit) issue.addIssue({ code: "custom", path: ["approved_facts", i], message: `uses "${hit}", which the brand said never to use` });
    });
    // The opening is the one part the brief dictates: the first beat says
    // the hook word for word, and no beat carries a figure the file lacks.
    if (v.opening === null) {
      issue.addIssue({ code: "custom", path: ["opening"], message: "opening is required: the first three seconds, shot by shot, the first beat's vo being the primary hook" });
    } else if (v.opening) {
      // The hook is said or shown in the opening, word for word.
      const said = v.opening.beats.some((b) => wordOverlap(b.vo, v.hooks.primary) >= 0.6 || wordOverlap(b.on_screen_text, v.hooks.primary) >= 0.6);
      if (!said) {
        issue.addIssue({ code: "custom", path: ["opening", "beats"], message: "one of the opening beats must say or show the primary hook, word for word" });
      }
      v.opening.beats.forEach((b, i) => {
        const s = `${b.visual} ${b.on_screen_text} ${b.vo}`;
        const c = claimNumbers(s);
        const badPct = c.percents.find((p) => !have.percents.has(p));
        const badDollar = c.dollars.find((d) => !allowedDollars.some((a) => Math.abs(a - d) <= 0.5) && !have.numbers.has(d));
        if (badPct !== undefined || badDollar !== undefined) {
          issue.addIssue({ code: "custom", path: ["opening", "beats", i], message: "an opening beat carries a figure nothing on file supports" });
        }
        if (RESULT_WORDS.test(s)) issue.addIssue({ code: "custom", path: ["opening", "beats", i], message: "an opening beat promises a result" });
        const hit = forbidden.find((p) => s.toLowerCase().includes(p));
        if (hit) issue.addIssue({ code: "custom", path: ["opening", "beats", i], message: `uses "${hit}", which the brand said never to use` });
      });
    }
    // The hypothesis is a hypothesis: it says what may happen, not what will.
    if (/\b(will|always|definitely|certainly)\b/i.test(v.hypothesis) && !/\b(may|might|could|whether|we think|we expect|likely)\b/i.test(v.hypothesis)) {
      issue.addIssue({ code: "custom", path: ["hypothesis"], message: "written as a certainty; a hypothesis says what may improve response and why" });
    }
  }).transform(
    (v): ConceptWrite => ({
      title: plainText(v.title),
      situation: plainText(v.situation),
      hypothesis: plainText(v.hypothesis),
      unknowns: v.unknowns.map(plainText).filter(Boolean),
      differs_from: cleanOptional(v.differs_from),
      format: plainText(v.format),
      hooks: { primary: plainText(v.hooks.primary), alternatives: v.hooks.alternatives.map(plainText).filter(Boolean) },
      script: {
        direction: { show: plainText(v.script.direction.show), say: plainText(v.script.direction.say), prove: plainText(v.script.direction.prove) },
        cta: plainText(v.script.cta),
        duration_seconds: Math.round(v.script.duration_seconds),
      },
      opening: v.opening
        ? { beats: v.opening.beats.map((b) => ({ visual: plainText(b.visual), on_screen_text: plainText(b.on_screen_text ?? ""), vo: plainText(b.vo ?? "") })) }
        : null,
      shot_list: v.shot_list.map(plainText).filter(Boolean),
      approved_facts: v.approved_facts.map(plainText).filter(Boolean),
      outcomes: { if_better: plainText(v.outcomes.if_better), if_same: plainText(v.outcomes.if_same), if_worse: plainText(v.outcomes.if_worse) },
      priority_reason: plainText(v.priority_reason),
      guardrail: cleanOptional(v.guardrail),
    }),
  );
}

function cleanOptional(s: string | null | undefined): string | null {
  const t = plainText(s ?? "");
  if (t.length < 10 || /^(none|null|n\/a|no guardrail|nothing)\.?$/i.test(t)) return null;
  return t;
}

export function validateConceptWrite(raw: unknown, rules: ConceptRules): { ok: true; value: ConceptWrite } | { ok: false; error: string } {
  const parsed = conceptSchemaFor(rules).safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const lines = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, error: [...new Set(lines)].join("; ") };
}

/* -------------------------------- duplicates ----------------------------- */

/** Two concepts this close say the same thing. Hook variations are children
 * of one concept, never two concepts. */
export const DUPLICATE_OVERLAP = 0.45;

export function conceptsOverlap(
  a: Pick<ConceptWrite, "title" | "hypothesis" | "situation" | "hooks">,
  b: Pick<ConceptWrite, "title" | "hypothesis" | "situation" | "hooks">,
): boolean {
  if (a.hooks.primary.trim().toLowerCase() === b.hooks.primary.trim().toLowerCase()) return true;
  const textOf = (c: typeof a) => `${c.title} ${c.hypothesis} ${c.situation}`;
  return wordOverlap(textOf(a), textOf(b)) >= DUPLICATE_OVERLAP;
}

/**
 * Keep the distinct concepts, in order. A later concept too close to an
 * earlier one is dropped, and the caller shows fewer: a quota filled with
 * repeats is worse than a short list.
 */
export function distinctConcepts<T extends Pick<ConceptWrite, "title" | "hypothesis" | "situation" | "hooks">>(concepts: T[]): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const c of concepts) {
    if (kept.some((k) => conceptsOverlap(k, c))) dropped.push(c);
    else kept.push(c);
  }
  return { kept, dropped };
}

/* ----------------------------- brief assembly ---------------------------- */

/** The stored brief from a validated write plus what code adds. */
export function assembleBrief(
  write: ConceptWrite,
  computed: {
    evaluation: CreativeBrief["evaluation"];
    structuralUnknowns: string[];
    differsFallback: string;
    /** The brand's own past ads of this shape against its account (lib/ads/history-read.ts). */
    lineage?: CreativeBrief["lineage"];
  },
): CreativeBrief {
  const unknowns = [...write.unknowns];
  for (const u of computed.structuralUnknowns) if (!unknowns.some((x) => wordOverlap(x, u) >= 0.6)) unknowns.push(u);
  return {
    version: CONCEPT_VERSION,
    situation: write.situation,
    hypothesis: write.hypothesis,
    unknowns: unknowns.slice(0, UNKNOWNS_MAX + 2),
    differs_from: write.differs_from ?? computed.differsFallback,
    format: write.format,
    hooks: write.hooks,
    script: write.script,
    opening: write.opening ?? null,
    shot_list: write.shot_list,
    approved_facts: write.approved_facts,
    evaluation: computed.evaluation,
    outcomes: write.outcomes,
    lineage: computed.lineage ?? null,
    refined_from: null,
  };
}
