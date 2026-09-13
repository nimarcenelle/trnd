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

export function pickWriteSchemaFor(ctx: PickWriteContext) {
  const term = ctx.term.trim().toLowerCase();
  return PickWriteBase.superRefine((v, issue) => {
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
