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
          direction: {
            type: "OBJECT",
            properties: {
              show: { type: "STRING" },
              say: { type: "STRING" },
              prove: { type: "STRING" },
            },
            required: ["show", "say", "prove"],
          },
          cta: { type: "STRING" },
          duration_seconds: { type: "INTEGER" },
        },
        required: ["variant_label", "thesis", "hook", "direction", "cta", "duration_seconds"],
      },
    },
  },
  required: ["finding", "bet_what", "guardrail", "scripts"],
} as unknown as Schema;

export async function writePickWithGemini(
  input: PickWriterInput,
  models?: { flash: string; pro: string },
): Promise<{ value: PickWrite; model: string }> {
  const { creativeCall, resolveModels } = await import("./gemini");
  const m = models ?? (await resolveModels());
  const schema = pickWriteSchemaFor({ term: input.term, deltaPct: input.deltaPct, gap: true });
  // Pro first: this is the creative call the whole page rests on, with one
  // lower-temperature retry. Then Flash, under the same validation. A Pro
  // outage (or a retired Pro id) used to turn every pick of the week into a
  // draft, which is an empty list; a Flash pick that passes the same checks
  // is better than no week at all.
  return creativeCall(m, buildPickPrompt(input), PICK_RESPONSE_SCHEMA, (d) => schema.parse(d));
}

/* ------------------------------ keyless path ------------------------------ */

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
beats: [],
direction: {
      show: `The problem people mean by "${term}", in a real setting with the light as it is, then ${product} put to use by one person, then the same view after.`,
      say: `Name the problem the way the customer does, then say plainly what ${product} does about it. No promise of a result, just what changes and why.`,
      prove: `One thing the viewer can check: what ${product} is made of, what it removes, or a customer in their own words. Nothing invented.`,
    },
    cta,
    duration_seconds: durationSec,
  };
  const priceAnchor: PickWriteScript = price
    ? {
        variant_label: "Price anchor",
        thesis: "Lead with the listed price so the decision feels small.",
        hook: `${product}, ${price}. Here is what that gets you.`,
        beats: [],
    direction: {
          show: `${product} on a plain surface with the price in view, then in use in one continuous shot, then the detail that earns the price.`,
          say: `Say the price early and let the rest of the video explain what it buys. Talk about the item, not about the viewer.`,
          prove: `The listed price, exactly as the page shows it, and one concrete detail of the item that is true on the page.`,
        },
        cta,
        duration_seconds: durationSec,
      }
    : {
        variant_label: "Side by side",
        thesis: `Put what they use now next to ${product} and let the difference show.`,
        hook: `What you use now, next to ${product}`,
        beats: [],
    direction: {
          show: `What most people use now, shot plainly, then ${product} in the same spot and light, then ${product} in use.`,
          say: `Describe the difference the viewer would notice, without naming another brand and without saying theirs is bad.`,
          prove: `One visible difference the camera can show, not a claimed result.`,
        },
        cta,
        duration_seconds: durationSec,
      };
  const inUse: PickWriteScript = {
    variant_label: "One take",
    thesis: `Show ${product} used start to finish with no cuts, so it looks as easy as it is.`,
    hook: `One take, start to finish, with ${product}`,
beats: [],
direction: {
      show: `${product} from unopened to finished, one continuous shot, no cuts, held two seconds on the result.`,
      say: `Talk through what you are doing as you do it, as you would to a friend. Let the lack of cuts make the point about how easy it is.`,
      prove: `That it really is one take: the clock, the light or the background must not change.`,
    },
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
