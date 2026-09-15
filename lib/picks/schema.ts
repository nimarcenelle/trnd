import { z } from "zod";

import type { PickBeat, PickDirection } from "@/lib/db/types";

import { mentionsDelta } from "./metric";

/**
 * The shape a pick writer must return, checked before anything is stored.
 * The model path and the keyless template both pass through here, and a pick
 * that fails is stored as a draft: better four picks on the page than one
 * broken one.
 */

export const SCRIPTS_PER_PICK = 3;
export const BEATS_MAX = 5;

/**
 * Owner-facing text carries no em dashes and no arrows. The system prompt
 * shared with the campaign writer allows the dash, so it is cleaned here
 * rather than failed: a good script is not worth a draft over punctuation.
 */
export function plainText(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s*(?:→|⟶|➜|➔|->|=>)\s*/g, " to ")
    .replace(/\s+/g, " ")
    .replace(/,\s*([.,;:!?])/g, "$1")
    .replace(/^,\s*/, "")
    .trim();
}

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const BeatSchema = z.object({
  visual: text(3, 280),
  on_screen_text: z.string().max(90).nullish(),
  vo: z.string().max(320).nullish(),
});

const DirectionSchema = z.object({
  show: text(20, 360),
  say: text(20, 360),
  prove: text(10, 360),
});

const ScriptSchema = z.object({
  variant_label: text(2, 40),
  thesis: text(3, 200),
  hook: text(8, 160),
  // A shot list is no longer asked for; one that arrives is kept but never shown first.
  beats: z.array(BeatSchema).max(BEATS_MAX).default([]),
  direction: DirectionSchema,
  cta: text(3, 100),
  duration_seconds: z.number().min(5).max(90),
});

const PickWriteBase = z.object({
  finding: text(20, 260),
  bet_what: text(10, 200),
  guardrail: z.string().max(360).nullish(),
  scripts: z.array(ScriptSchema).length(SCRIPTS_PER_PICK),
});

export interface PickWriteScript {
  variant_label: string;
  thesis: string;
  hook: string;
  beats: PickBeat[];
  direction: PickDirection;
  cta: string;
  duration_seconds: number;
}

export interface PickWrite {
  finding: string;
  bet_what: string;
  guardrail: string | null;
  scripts: PickWriteScript[];
}

export interface PickWriteContext {
  term: string;
  /** The pick's metric delta: the finding may not print it. */
  deltaPct: number | null;
  /** The matched item's price. A script that quotes another price is
   * selling another product: "This fifty nine dollar towel" opened a
   * script for the $38 cream. Null when the item has no price. */
  priceCents?: number | null;
  /** Other listed prices a script may name: the items the bet or the
   * finding itself sells. The matcher pairs a towel search with the bundle
   * that contains the towel, the bet names the towel, and the towel's own
   * price is then the right one, not the bundle's. */
  allowedPriceCents?: number[];
  /** Hold the model to a real gap: the finding names the item the bet runs,
   * and never quotes the brand using the customer's own words back. Off for
   * the keyless template, which has no page copy to find a gap in. */
  gap?: boolean;
}

/** Content words: lowercase, four letters or more, plural-blind. */
function contentWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

const normalizeQuotes = (s: string) => s.replace(/[“”]/g, '"');

function cleanGuardrail(g: string | null | undefined): string | null {
  const t = plainText(g ?? "");
  if (t.length < 10 || /^(none|null|n\/a|no guardrail)\.?$/i.test(t)) return null;
  return t;
}

const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "thirty eight", "thirty-eight", "one hundred forty nine" as a number. */
function wordsToNumber(words: string): number | null {
  let total = 0;
  let current = 0;
  let any = false;
  for (const w of words.toLowerCase().split(/[\s-]+/).filter(Boolean)) {
    if (w in ONES) {
      current += ONES[w];
      any = true;
    } else if (w in TENS) {
      current += TENS[w];
      any = true;
    } else if (w === "hundred") {
      current = (current || 1) * 100;
      any = true;
    } else if (w === "and") continue;
    else return null;
  }
  total += current;
  return any ? total : null;
}

/** Every dollar amount a text names: "$38", "38 dollars", "thirty eight dollar". */
export function pricesMentioned(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,4}(?:\.\d{2})?)/g)) out.push(Number(m[1]));
  for (const m of text.matchAll(/\b(\d{1,4}(?:\.\d{2})?)\s?(?:dollars?|bucks)\b/gi)) out.push(Number(m[1]));
  const number = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and|[\\s-])+";
  for (const m of text.matchAll(new RegExp(`\\b(${number})\\s?dollars?\\b`, "gi"))) {
    const n = wordsToNumber(m[1]);
    if (n !== null && n > 0) out.push(n);
  }
  return out.filter((n) => Number.isFinite(n) && n > 0);
}

export function pickWriteSchemaFor(ctx: PickWriteContext) {
  const term = ctx.term.trim().toLowerCase();
  return PickWriteBase.superRefine((v, issue) => {
    // The price closes an ad; it never opens one. A hook that names a
    // price, or a route named for one, is a price-led script.
    v.scripts.forEach((s, i) => {
      if (/price/i.test(s.variant_label) || pricesMentioned(s.hook).length > 0) {
        issue.addIssue({ code: "custom", path: ["scripts", i], message: "leads with the price; the price belongs in the close" });
      }
    });
    // A script sells the pick's item at the pick's price, or it sells
    // something else.
    if (typeof ctx.priceCents === "number" && ctx.priceCents > 0) {
      const price = ctx.priceCents / 100;
      const allowed = [price, ...(ctx.allowedPriceCents ?? []).filter((c) => c > 0).map((c) => c / 100)];
      v.scripts.forEach((s, i) => {
        const d = (s as { direction?: { show?: string; say?: string; prove?: string } | null }).direction;
        const text = [s.hook, s.cta, d?.show, d?.say, d?.prove].filter(Boolean).join(" ");
        const other = pricesMentioned(text).find((n) => !allowed.some((a) => Math.abs(n - a) <= 0.5));
        if (other !== undefined) {
          issue.addIssue({ code: "custom", path: ["scripts", i], message: `names a price of $${other} while the item is $${price}` });
        }
      });
    }
    const finding = normalizeQuotes(v.finding).toLowerCase();
    // The finding's subject is the customer's words, so it has to quote them.
    if (!finding.includes(`"${term}`)) {
      issue.addIssue({ code: "custom", path: ["finding"], message: `finding must quote the term "${ctx.term}"` });
    }
    // The metric is shown once, by the page. A finding is words against words.
    if (/\d\s?%/.test(v.finding) || mentionsDelta(v.finding, ctx.deltaPct)) {
      issue.addIssue({ code: "custom", path: ["finding"], message: "finding must not contain the metric number" });
    }
    if (ctx.gap) {
      const quotes = [...normalizeQuotes(v.finding).matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/[.,;:]+$/, ""));
      const brandWords = quotes[1] ? contentWords(quotes[1]) : [];
      const termWords = contentWords(ctx.term);
      // "searching 'filtered showerhead', page says 'Handheld Filtered
      // Showerhead'" is a match, not a finding.
      if (brandWords.length > 0 && termWords.length > 0 && termWords.every((w) => brandWords.includes(w))) {
        issue.addIssue({
          code: "custom",
          path: ["finding"],
          message: 'the brand already uses the customer\'s words; name what the page leads with instead ("leads with")',
        });
      }
      // The H1 said the page sells Shower Steamers while the bet ran the
      // showerhead. The item in the finding is the item the ad sells.
      const leadsWith = /\bleads with\b/i.test(v.finding);
      // Compare the item's own words only: a bet line that repeats the term
      // ("the base of the everything shower") must not let "Shower
      // Steamers" pass as the showerhead because both say "shower".
      const itemWords = brandWords.filter((w) => !termWords.includes(w));
      if (!leadsWith && itemWords.length > 0) {
        const bet = new Set(contentWords(v.bet_what).filter((w) => !termWords.includes(w)));
        const shared = itemWords.filter((w) => bet.has(w)).length;
        if (shared * 2 < itemWords.length) {
          issue.addIssue({ code: "custom", path: ["finding"], message: "the item in the finding must be the item bet_what runs" });
        }
      }
    }
    const theses = new Set(v.scripts.map((s) => s.thesis.trim().toLowerCase()));
    const labels = new Set(v.scripts.map((s) => s.variant_label.trim().toLowerCase()));
    if (theses.size < v.scripts.length || labels.size < v.scripts.length) {
      issue.addIssue({ code: "custom", path: ["scripts"], message: "each script needs its own thesis" });
    }
  }).transform(
    (v): PickWrite => ({
      finding: plainText(v.finding),
      bet_what: plainText(v.bet_what),
      guardrail: cleanGuardrail(v.guardrail),
      scripts: v.scripts.map((s) => ({
        variant_label: plainText(s.variant_label),
        thesis: plainText(s.thesis),
        hook: plainText(s.hook),
        beats: s.beats.map((b) => ({
          visual: plainText(b.visual),
          on_screen_text: plainText(b.on_screen_text ?? ""),
          vo: plainText(b.vo ?? ""),
        })),
        direction: { show: plainText(s.direction.show), say: plainText(s.direction.say), prove: plainText(s.direction.prove) },
        cta: plainText(s.cta),
        duration_seconds: Math.round(s.duration_seconds),
      })),
    }),
  );
}

export function validatePickWrite(
  raw: unknown,
  ctx: PickWriteContext,
): { ok: true; value: PickWrite } | { ok: false; error: string } {
  const parsed = pickWriteSchemaFor(ctx).safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
  };
}
