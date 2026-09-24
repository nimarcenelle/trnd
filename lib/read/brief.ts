import { z } from "zod";

import { isModelConfigured } from "@/lib/env";

import { OPENING_LABEL, OPENING_PHRASE, type Gap, type Opening } from "./gap";

/**
 * The one free brief at the bottom of the category read: a test that fills
 * the gap, with the first three seconds dictated beat by beat. It is the
 * product's promise in miniature, so it is held to the product's rules: a
 * hypothesis and not a prediction, no figure the site didn't state, and the
 * evidence named for what it is.
 */

export interface ReadBeat {
  /** "0–1s" */
  at: string;
  see: string;
  onScreen: string;
  say: string;
}

export interface ReadBrief {
  title: string;
  product: string;
  hypothesis: string;
  hook: string;
  beats: ReadBeat[];
  /** Why this test, from the counts. */
  because: string;
  /** Written by the model, or by the template when there is none. */
  writer: "model" | "template";
}

export interface ReadBriefInput {
  brand: string;
  category: string;
  products: { name: string; price: string }[];
  siteText: string;
  gap: Gap;
}

const BriefSchema = z.object({
  title: z.string(),
  product: z.string(),
  hypothesis: z.string(),
  hook: z.string(),
  beats: z
    .array(z.object({ at: z.string(), see: z.string(), onScreen: z.string(), say: z.string() }))
    .min(3)
    .max(3),
});

const CERTAINTY = /\b(guarantee[sd]?|proven to|will (double|triple|boost|increase)|best[- ]performing|clinically proven|#1)\b/i;

/** Every number a brief may state: the ones the brand's own site and prices say. */
function allowedNumbers(input: ReadBriefInput): Set<number> {
  const text = `${input.siteText} ${input.products.map((p) => `${p.name} ${p.price}`).join(" ")}`;
  return new Set([...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))));
}

/** Throws with the line to fix, so the retry is told what was wrong. */
export function checkReadBrief(brief: z.infer<typeof BriefSchema>, input: ReadBriefInput): void {
  const allowed = allowedNumbers(input);
  const lines = [brief.hook, brief.hypothesis, ...brief.beats.flatMap((b) => [b.onScreen, b.say])];
  for (const line of lines) {
    // Every figure, not only the shapes a claim usually takes: "93% of",
    // "3x softer" and "10,000 customers" are all a number the site didn't say.
    for (const m of line.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      // A beat's timing ("2 seconds in") isn't a claim.
      if (/^\s*(?:s\b|secs?\b|seconds?\b|minutes?\b|mins?\b)/.test(line.slice((m.index ?? 0) + m[0].length))) continue;
      const value = Number(m[0].replace(/,/g, ""));
      if (!allowed.has(value)) throw new Error(`"${m[0]}" in "${line}" is not a figure the brand's site states. Remove it.`);
    }
    const certain = line.match(CERTAINTY);
    if (certain) throw new Error(`"${certain[0]}" in "${line}" promises a result. Say it as something to test.`);
  }
}

export function buildReadBriefPrompt(input: ReadBriefInput): string {
  const { gap } = input;
  const opening = gap.opening as Opening;
  const products = input.products
    .slice(0, 20)
    .map((p) => `${p.name}${p.price ? ` (${p.price})` : ""}`)
    .join("; ");
  return [
    `You write one creative test brief for a DTC brand's next Meta ad. The test fills one gap found in its category's live ads.`,
    `BRAND: ${input.brand}, ${input.category}.`,
    `PRODUCTS: ${products || "not listed"}.`,
    `FROM THEIR SITE: ${input.siteText.replace(/\s+/g, " ").slice(0, 3000)}`,
    ``,
    `THE GAP: ${gap.headline}`,
    gap.example ? `A RIVAL AD WITH THIS OPENING, STILL RUNNING AFTER ${gap.example.runningDays ?? "?"} DAYS (${gap.example.advertiser}): "${gap.example.text}"` : "",
    ``,
    `Write a test that makes the ad ${OPENING_PHRASE[opening]}, for this brand, in its own voice. Do not copy the rival's ad.`,
    `- title: the concept in five to eight words.`,
    `- product: the one product it sells, named as the site names it.`,
    `- hypothesis: one sentence, "If we ${OPENING_PHRASE[opening]} with ..., then ... because ...". A bet to test, never a promise.`,
    `- hook: the first words said on camera, word for word, under 15 words.`,
    `- beats: exactly three, at "0–1s", "1–2s", "2–3s". For each: see (what the camera shows, concrete enough to shoot), onScreen (the text overlay, or "none"), say (the words spoken, or "none"). The first beat says the hook.`,
    `Rules: no statistic, percentage, price or number the site doesn't state. No "guaranteed", "proven", "best-performing" or "clinically". Plain words, no dashes.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function because(gap: Gap): string {
  return `${gap.headline} ${gap.limit}`;
}

/** The brief without a model: the structure is real, the specifics are the brand's to fill. */
export function templateReadBrief(input: ReadBriefInput): ReadBrief {
  const opening = (input.gap.opening ?? "problem") as Opening;
  const product = input.products[0]?.name ?? `${input.brand}'s hero product`;
  const hooks: Record<Opening, string> = {
    problem: `[The problem ${product} fixes], every single day?`,
    question: `Why does nobody tell you [the thing ${product} changes]?`,
    story: `I started ${input.brand} because [the moment it began].`,
    demonstration: `Watch what happens when [${product} does its one job].`,
    comparison: `[The usual fix] versus ${product}.`,
    offer: `[Your live offer on ${product}], this week only.`,
    claim: `${product} is the [one thing it does better than anything].`,
    callout: `If you [the customer's situation], this is for you.`,
  };
  return {
    title: `${OPENING_LABEL[opening]} opening for ${product}`,
    product,
    hypothesis: `If we ${OPENING_PHRASE[opening]} for ${product}, then more of the right people stop scrolling, because it's the opening the category keeps paying for and ${input.brand} isn't running.`,
    hook: hooks[opening],
    beats: [
      { at: "0–1s", see: `Close on the person the problem belongs to, mid-moment.`, onScreen: hooks[opening], say: hooks[opening] },
      { at: "1–2s", see: `${product} enters the frame in the same moment.`, onScreen: "none", say: `[One line on what ${product} does about it.]` },
      { at: "2–3s", see: `The result, shown and not described.`, onScreen: product, say: "none" },
    ],
    because: because(input.gap),
    writer: "template",
  };
}

/** The model's brief when one is configured; the template otherwise, or when it fails twice. */
export async function writeReadBrief(input: ReadBriefInput): Promise<ReadBrief> {
  if (!input.gap.opening) return templateReadBrief(input);
  if (!isModelConfigured) return templateReadBrief(input);
  try {
    const { creativeCall, resolveModels } = await import("@/lib/ai/openai");
    const validate = (d: unknown) => {
      const parsed = BriefSchema.parse(d);
      checkReadBrief(parsed, input);
      return parsed;
    };
    const { value } = await creativeCall(await resolveModels(), buildReadBriefPrompt(input), BriefSchema, validate);
    return { ...value, because: because(input.gap), writer: "model" };
  } catch (err) {
    console.warn("[read] brief writer failed; the template stands in:", (err as Error).message);
    return templateReadBrief(input);
  }
}
