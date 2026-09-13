import type { Schema } from "@google/genai";

import { isGeminiConfigured } from "@/lib/env";
import { pickWriteSchemaFor, type PickWrite, type PickWriteScript } from "@/lib/picks/schema";
import { isOnlineBusiness } from "@/lib/signals/geo";

import { buildPickPrompt, formatPrice, PICK_PROMPT_VERSION, type PickPromptCtx } from "./prompts/pick";

/**
 * Writes the words on one pick: the finding, what to run, the guardrail and
 * three scripts. Everything numeric on the pick (the metric, the budget, the
 * kill rule) is computed before this is called and is not the writer's to
 * change.
 *
 * With GEMINI_API_KEY: one Pro call through `structuredCall`, which retries
 * once on a schema violation. Without it: a deterministic template, so a
 * demo install still gets ready picks.
 */

export { PICK_PROMPT_VERSION };
export const PICK_FALLBACK_MODEL = "trnd-template/pick-1";

export interface PickWriterInput extends PickPromptCtx {
  /** The metric's delta, so validation can refuse a finding that repeats it. */
  deltaPct: number | null;
}

/** Returns unvalidated output; the weekly job validates whatever comes back. */
export type PickWriter = (input: PickWriterInput) => Promise<unknown>;

/**
 * The response schema the model is held to. Plain values rather than the
 * SDK's Type enum so the SDK itself stays behind lib/ai/gemini.ts.
 */
export const PICK_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    finding: { type: "STRING" },
    bet_what: { type: "STRING" },
    guardrail: { type: "STRING", nullable: true },
    scripts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          variant_label: { type: "STRING" },
          thesis: { type: "STRING" },
          hook: { type: "STRING" },
          beats: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                visual: { type: "STRING" },
                on_screen_text: { type: "STRING" },
                vo: { type: "STRING" },
              },
              required: ["visual", "on_screen_text", "vo"],
            },
          },
          cta: { type: "STRING" },
          duration_seconds: { type: "INTEGER" },
        },
        required: ["variant_label", "thesis", "hook", "beats", "cta", "duration_seconds"],
      },
    },
  },
  required: ["finding", "bet_what", "guardrail", "scripts"],
} as unknown as Schema;

export async function writePickWithGemini(
  input: PickWriterInput,
  models?: { flash: string; pro: string },
): Promise<{ value: PickWrite; model: string }> {
  const { resolveModels, structuredCall } = await import("./gemini");
  const m = models ?? (await resolveModels());
  const schema = pickWriteSchemaFor({ term: input.term, deltaPct: input.deltaPct });
  // Pro: this is the creative call the whole page rests on. structuredCall
  // retries once at a lower temperature; a second failure is the caller's
  // draft, not a Flash rewrite of someone else's brief.
  const value = await structuredCall(m.pro, buildPickPrompt(input), PICK_RESPONSE_SCHEMA, (d) => schema.parse(d));
  return { value, model: m.pro };
}

/* ------------------------------ keyless path ------------------------------ */

function words(s: string, max: number): string {
  const w = s.replace(/\s+/g, " ").trim().split(" ");
  return w.slice(0, max).join(" ");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Health, beauty and body products are where Meta's personal attributes
 * rule and before-and-after limits actually bite. */
const SENSITIVE = /health|beauty|skin|hair|acne|supplement|vitamin|wellness|dental|teeth|spa|weight|fitness|cosmetic|derm|body|sleep|scalp/i;

function platformLine(input: PickWriterInput): string {
  const p = input.business.ad_platforms;
  if (p.includes("meta") && p.includes("tiktok")) return "Reels and TikTok";
  if (p.includes("tiktok")) return "TikTok";
  if (p.includes("meta")) return "Reels";
  return isOnlineBusiness(input.business) ? "Reels and TikTok" : "Instagram and Facebook Reels";
}

export function fallbackPickWrite(input: PickWriterInput): PickWrite {
  const { term, business, matchedService, services, durationSec } = input;
  const online = isOnlineBusiness(business);
  const item = matchedService ?? services.find((s) => s.is_active) ?? null;
  const product = item?.name ?? business.name;
  const price = formatPrice(item?.price_cents);
  const page = online ? "product page" : "menu";
  const finding = matchedService
    ? `Your customers are searching "${term}." Your ${page} says "${matchedService.name}."`
    : `Your customers are searching "${term}." Nothing on your ${page} uses those words.`;
  const cta = online ? `Shop ${product}${price ? `, ${price}` : ""}` : `Get ${product}${price ? ` for ${price}` : ""} this week`;
  const sensitive = SENSITIVE.test(`${business.category} ${product} ${term}`);

  const problemFirst: PickWriteScript = {
    variant_label: "Problem first",
    thesis: `Open on the problem people mean by "${term}" and let ${product} answer it.`,
    hook: `This is what people mean by "${term}"`,
    beats: [
      { visual: `Close on the problem people mean by "${term}", in real light, no setup.`, on_screen_text: cap(words(term, 6)), vo: "" },
      { visual: `Hands put ${product} to use in one take.`, on_screen_text: words(product, 6), vo: "" },
      { visual: "The same shot as the opening, after.", on_screen_text: price ? `${words(product, 4)}, ${price}` : words(product, 6), vo: "" },
    ],
    cta,
    duration_seconds: durationSec,
  };
  const priceAnchor: PickWriteScript = price
    ? {
        variant_label: "Price anchor",
        thesis: "Lead with the listed price so the decision feels small.",
        hook: `${product}, ${price}. Here is what that gets you.`,
        beats: [
          { visual: `${product} on a plain surface, price card beside it.`, on_screen_text: price, vo: "" },
          { visual: `${product} in use, one continuous shot.`, on_screen_text: "", vo: `This is ${product}.` },
          { visual: "Close on the detail that makes it worth the price.", on_screen_text: words(term, 6), vo: "" },
        ],
        cta,
        duration_seconds: durationSec,
      }
    : {
        variant_label: "Side by side",
        thesis: `Put what they use now next to ${product} and let the difference show.`,
        hook: `What you use now, next to ${product}`,
        beats: [
          { visual: "What most people use now, shot plainly.", on_screen_text: "Most people use this", vo: "" },
          { visual: `${product} in the same spot, same light.`, on_screen_text: words(product, 6), vo: "" },
          { visual: `${product} in use, one continuous shot.`, on_screen_text: words(term, 6), vo: "" },
        ],
        cta,
        duration_seconds: durationSec,
      };
  const inUse: PickWriteScript = {
    variant_label: "One take",
    thesis: `Show ${product} used start to finish with no cuts, so it looks as easy as it is.`,
    hook: `One take, start to finish, with ${product}`,
    beats: [
      { visual: `${product} in hand, before it is opened or used.`, on_screen_text: "No cuts", vo: "" },
      { visual: "The whole use, one continuous shot from the same angle.", on_screen_text: "", vo: "" },
      { visual: "The finished result, held for two seconds.", on_screen_text: words(product, 6), vo: "" },
    ],
    cta,
    duration_seconds: durationSec,
  };

  return {
    finding,
    bet_what: `${product}, a problem-first video on "${term}" for ${platformLine(input)}`,
    guardrail: sensitive
      ? `Meta rejects copy that implies the viewer has a condition, so write "for ${term}" rather than about the viewer, and skip before and after shots.`
      : null,
    scripts: [problemFirst, priceAnchor, inUse],
  };
}

/** The writer the weekly job uses when none is injected. */
export function defaultPickWriter(models?: { flash: string; pro: string }): PickWriter {
  if (!isGeminiConfigured) return async (input) => fallbackPickWrite(input);
  return async (input) => (await writePickWithGemini(input, models)).value;
}
