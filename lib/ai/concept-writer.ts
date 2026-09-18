import type { Schema } from "@google/genai";

import type { Business, BusinessBrief, PickSignal, Service } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { conceptSchemaFor, type ConceptRules, type ConceptWrite } from "@/lib/picks/concept";
import type { CampaignSignalBrief } from "@/lib/recommend/four-signals";
import { objectiveList } from "@/lib/onboarding/context";
import { isOnlineBusiness } from "@/lib/signals/geo";

import { formatPrice } from "./prompts/pick";
import { validationFeedback } from "./pick-writer";

/**
 * Writes one creative test: the concept a brand hands to a creator.
 *
 * The writer is given evidence and asked for judgment. The evidence rows
 * are on the page already, with their sources and their limits; the writer
 * leans on them and never restates their figures. What it returns is a
 * hypothesis, a script, a shot list and the facts it used, and the facts
 * are checked before anything is stored (lib/picks/concept.ts).
 */

export const CONCEPT_PROMPT_VERSION = "concept-1";
export const CONCEPT_FALLBACK_MODEL = "trnd-template/concept-1";

export interface ConceptWriterInput {
  business: Business;
  term: string;
  matchedService: Service | null;
  services: Service[];
  brief: BusinessBrief | null;
  signals: CampaignSignalBrief;
  /** The evidence rows already computed for the page. */
  evidence: { signal: PickSignal; claim: string; kind?: string | null }[];
  /** Real customer words, when any were read. Never invented. */
  quotes: string[];
  /** What the brand already ran on this term (memory lines). */
  memory: string[];
  /** The concepts already written this week, so this one differs. */
  otherConcepts: { title: string; hypothesis: string }[];
  durationSec: number;
  /** The last draft's rejection, on a retry. */
  feedback?: string | null;
  /** A refinement ask from the owner, when rewriting an existing brief. */
  refinement?: { ask: string; previous: ConceptWrite } | null;
}

/** Returns unvalidated output; the weekly job validates whatever comes back. */
export type ConceptWriter = (input: ConceptWriterInput, rules: ConceptRules) => Promise<unknown>;

export const CONCEPT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    situation: { type: "STRING" },
    hypothesis: { type: "STRING" },
    unknowns: { type: "ARRAY", items: { type: "STRING" } },
    differs_from: { type: "STRING", nullable: true },
    format: { type: "STRING" },
    hooks: {
      type: "OBJECT",
      properties: { primary: { type: "STRING" }, alternatives: { type: "ARRAY", items: { type: "STRING" } } },
      required: ["primary", "alternatives"],
    },
    script: {
      type: "OBJECT",
      properties: {
        direction: {
          type: "OBJECT",
          properties: { show: { type: "STRING" }, say: { type: "STRING" }, prove: { type: "STRING" } },
          required: ["show", "say", "prove"],
        },
        cta: { type: "STRING" },
        duration_seconds: { type: "INTEGER" },
      },
      required: ["direction", "cta", "duration_seconds"],
    },
    shot_list: { type: "ARRAY", items: { type: "STRING" } },
    approved_facts: { type: "ARRAY", items: { type: "STRING" } },
    outcomes: {
      type: "OBJECT",
      properties: { if_better: { type: "STRING" }, if_same: { type: "STRING" }, if_worse: { type: "STRING" } },
      required: ["if_better", "if_same", "if_worse"],
    },
    priority_reason: { type: "STRING" },
    guardrail: { type: "STRING", nullable: true },
  },
  required: ["title", "situation", "hypothesis", "unknowns", "differs_from", "format", "hooks", "script", "shot_list", "approved_facts", "outcomes", "priority_reason", "guardrail"],
} as unknown as Schema;

const FORMAT_NAMES: Record<string, string> = {
  talking_head: "talking head to camera",
  ugc: "creator-style UGC",
  demo: "product demonstration",
  static: "static image with copy",
  editor: "edited footage with cuts and text",
  studio: "studio-shot product video",
};

/* ------------------------------- the prompt ------------------------------- */

function catalogBlock(input: ConceptWriterInput, online: boolean): string {
  const active = input.services.filter((s) => s.is_active !== false).slice(0, 90);
  if (active.length === 0) return "";
  return [
    online ? "CATALOG (what the brand sells, at its listed price):" : "MENU (what the business sells, at its listed price):",
    ...active.map((s) => {
      const p = formatPrice(s.price_cents);
      return `- ${s.name}${p ? ` (${p})` : ""}${s.description ? `: ${s.description.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
    }),
  ].join("\n");
}

function customerBlock({ signals, quotes }: ConceptWriterInput): string {
  const tc = signals.targetCustomer;
  const out: string[] = [];
  if (tc) {
    out.push(`WHO THE AD IS FOR: ${tc.who}`);
    if (tc.vocabulary.length > 0) out.push(`Their words for it: ${tc.vocabulary.slice(0, 12).join(", ")}.`);
    if (tc.triggers.length > 0) out.push(`What makes them buy: ${tc.triggers.slice(0, 4).join("; ")}.`);
    if (tc.objections.length > 0) out.push(`Why they hesitate: ${tc.objections.slice(0, 4).join("; ")}.`);
  }
  if (quotes.length > 0) {
    out.push("REAL CUSTOMER WORDS (quote these exactly or not at all; never write a quote of your own):");
    for (const q of quotes.slice(0, 6)) out.push(`- "${q.replace(/\s+/g, " ").slice(0, 200)}"`);
  }
  return out.join("\n");
}

function rivalBlock({ signals }: ConceptWriterInput): string {
  if (signals.rivalLines.length === 0) return "";
  return [
    "WHAT DIRECT RIVALS' ADS SAY (observed running; that they run says nothing about whether they work. Never echo a line, never name a rival):",
    ...signals.rivalLines.map((l) => `- ${l}`),
  ].join("\n");
}

function brandBlock(input: ConceptWriterInput): string {
  const { business, brief, memory, signals } = input;
  const out: string[] = [];
  if (memory.length > 0) {
    out.push("WHAT THIS BRAND ALREADY DID ON THIS TERM:");
    for (const line of memory) out.push(`- ${line}`);
  }
  if (business.recent_creative_notes) out.push(`WHAT THE BRAND SHOT RECENTLY (differs_from must say how this concept differs from it): ${business.recent_creative_notes}`);
  if (business.claims_notes) out.push(`WHAT THE BRAND MAY AND MAY NOT CLAIM (approved_facts must respect this): ${business.claims_notes}`);
  const best = signals.ownBestTheme;
  if (best && best.vsAccount >= 1.1) out.push(`Its ads built on ${best.theme.replace(/_/g, " ")} beat its own account average across ${best.ads} ads.`);
  if (brief?.watchouts.length) out.push(`Never: ${brief.watchouts.slice(0, 3).join(" | ")}`);
  if (business.brand_voice_notes) out.push(`HOW THEY TALK: ${business.brand_voice_notes}`);
  return out.join("\n");
}

function productionBlock(input: ConceptWriterInput): string {
  const formats = (input.business.production_formats ?? []).map((f) => FORMAT_NAMES[f] ?? f);
  return formats.length > 0
    ? `WHAT THEY CAN PRODUCE: ${formats.join(", ")}. The format and shot list must fit one of these.`
    : "WHAT THEY CAN PRODUCE: unknown. Write for one person with a phone and the product.";
}

export function buildConceptPrompt(input: ConceptWriterInput): string {
  const { business, term, matchedService, evidence, durationSec, otherConcepts, refinement } = input;
  const online = isOnlineBusiness(business);
  const price = formatPrice(matchedService?.price_cents);
  const objectives = business.campaign_objectives ?? [];
  const objective =
    objectives.length > 1
      ? `The brand runs campaigns that buy ${objectiveList(objectives)}. The concept must serve one of them; say which.`
      : objectives.length === 1
        ? `The campaign buys ${objectiveList(objectives)}.`
        : "";

  return [
    online
      ? `You are the creative strategist for ${business.name}, an online DTC brand (${business.category}). You write one creative test brief that a founder or growth marketer hands to a creator. The brand's location is not a factor.`
      : `You are the creative strategist for ${business.name}, a ${business.category} business in ${business.city}. You write one creative test brief that the owner hands to whoever shoots their ads.`,
    "A brief is a hypothesis to test, not a prediction. Say what you think may work and why, name what you do not know, and use only facts the brand has on file.",
    objective,
    "",
    `RESEARCH INPUT (where the concept came from; the brief is about the concept, not the phrase): "${term}"`,
    matchedService ? `The item this concept most likely sells: "${matchedService.name}"${price ? ` at ${price}` : ""}. Choose another listed item if it fits the concept better.` : "Choose the listed item that fits the concept.",
    "",
    catalogBlock(input, online),
    "",
    customerBlock(input),
    "",
    rivalBlock(input),
    "",
    brandBlock(input),
    "",
    productionBlock(input),
    "",
    evidence.length > 0
      ? ["WHAT THE PAGE ALREADY SHOWS (observations with sources; lean on them, never restate their figures, never treat one as proof of cause):", ...evidence.map((e) => `- ${e.claim}`)].join("\n")
      : "",
    otherConcepts.length > 0
      ? ["CONCEPTS ALREADY WRITTEN THIS WEEK (this one must test something different):", ...otherConcepts.map((c) => `- ${c.title}: ${c.hypothesis}`)].join("\n")
      : "",
    "",
    `FORMAT: the script runs about ${durationSec} seconds.`,
    "",
    "Return JSON:",
    `- title: the concept in 3 to 8 words, the way a creative team names an idea ("The towel that slips" not "microfiber hair towel"). Never the research phrase.`,
    `- situation: the customer moment, problem or objection this concept speaks to, in two or three sentences. Their situation, not the product's features.`,
    `- hypothesis: one or two sentences: "Test whether <this approach> is more persuasive than <what the brand does now or the obvious alternative>, because <the reason from the evidence>." Written as a belief, never a certainty. No figures.`,
    `- unknowns: 1 to 4 short lines on what you are not sure of or what is missing (a claim you could not verify, an audience you could not read, footage the brand may not have).`,
    `- differs_from: one sentence on how this differs from the brand's recent creative, when the brand said what it shot. null when it did not.`,
    `- format: the format, e.g. "20-second talking head" or "static image, one line".`,
    `- hooks: primary is the opening line or moment, under 12 words, a line a person would say, no price, no figure. alternatives: 2 or 3 other openings for the same concept.`,
    `- script: direction for the person making it, never lines to read. show: what the video shows (setting, the item in use, what one person can shoot). say: the argument in their own words. prove: the one fact to back up, and with what. cta: how to close, naming the item${price ? " and its listed price" : ""}. duration_seconds: ${durationSec}.`,
    `- shot_list: 3 to 6 shots, demonstrations or assets the creator needs, each one line, each shootable by one person unless the brand said it can do more.`,
    `- approved_facts: 1 to 5 product facts or claims the brief relies on, each taken from the catalog, the product pages, the owner's claims notes or the observations above. Never a fact from memory or from a rival. These are checked.`,
    `- outcomes: if_better, if_same, if_worse: one sentence each on what the result would teach and what to do next.`,
    `- priority_reason: one sentence on why this concept is worth a test this week, from the evidence. No figures.`,
    `- guardrail: one sentence naming a platform policy or brand-safety risk specific to this ad and the line or shot to avoid (Meta's personal attributes rule, health and beauty claims, before-and-after limits). null when nothing specific applies.`,
    "",
    "Voice, hard rules:",
    "- Short plain sentences. Read every line aloud.",
    "- No em dashes, no arrows, no exclamation marks, no emoji, no hashtags.",
    "- No hype words: revolutionize, unlock, elevate, game-changer, must-have, obsessed, viral, next level, transform, ultimate, seamless, curated.",
    "- No invented results, reviews, awards, discounts, shipping offers, guarantees or percentages. If you want a number, it must already be on file above.",
    "- A hook variation is not a new concept. One concept, several openings.",
    ...(refinement
      ? [
          "",
          "THIS IS A REFINEMENT of a brief the owner already has. Keep the concept, the approved facts and the evidence boundaries. Change only what the owner asked:",
          `- ${refinement.ask}`,
          "The previous brief:",
          JSON.stringify(refinement.previous, null, 0).slice(0, 4000),
        ]
      : []),
    ...(input.feedback
      ? ["", "Your previous draft was rejected. Fix exactly these problems and keep everything else as it was:", `- ${input.feedback.replace(/;\s*/g, "\n- ")}`]
      : []),
  ]
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------ the model path ---------------------------- */

export async function writeConceptWithGemini(
  input: ConceptWriterInput,
  rules: ConceptRules,
  models?: { flash: string; pro: string },
): Promise<{ value: ConceptWrite; model: string }> {
  const { creativeCall, resolveModels } = await import("./gemini");
  const m = models ?? (await resolveModels());
  const schema = conceptSchemaFor(rules);
  const validate = (d: unknown) => schema.parse(d);
  try {
    return await creativeCall(m, buildConceptPrompt(input), CONCEPT_RESPONSE_SCHEMA, validate);
  } catch (err) {
    const feedback = validationFeedback(err);
    if (!feedback) throw err;
    console.warn(`[concept] "${input.term}" rejected (${feedback}); asking for a fix`);
    return await creativeCall(m, buildConceptPrompt({ ...input, feedback }), CONCEPT_RESPONSE_SCHEMA, validate);
  }
}

/* ------------------------------- keyless path ----------------------------- */

const SENSITIVE = /health|beauty|skin|hair|acne|supplement|vitamin|wellness|dental|teeth|spa|weight|fitness|cosmetic|derm|body|sleep|scalp/i;

/**
 * A deterministic brief so a demo install and a keyless test still get the
 * whole shape. It makes no claim the catalog does not carry: the only
 * approved fact is the item's own name and listed price. Three templates
 * rotate with the week's position, so a keyless week holds three concepts
 * that differ, not one idea three times.
 */
export function fallbackConceptWrite(input: ConceptWriterInput): ConceptWrite {
  const { term, business, matchedService, services, durationSec } = input;
  const item = matchedService ?? services.find((s) => s.is_active) ?? null;
  const product = item?.name ?? business.name;
  const price = formatPrice(item?.price_cents);
  const online = isOnlineBusiness(business);
  const sensitive = SENSITIVE.test(`${business.category} ${product} ${term}`);
  const objection = input.signals.targetCustomer?.objections[0] ?? null;
  const page = online ? "product page" : "menu";
  const cta = online ? `Shop ${product}${price ? `, ${price}` : ""}` : `Get ${product}${price ? ` for ${price}` : ""} this week`;
  const guardrail = sensitive
    ? `Meta rejects copy that implies the viewer has a condition, so write "for ${term}" rather than about the viewer, and skip before-and-after shots.`
    : null;
  // The one fact a template can state: the item and its listed price, or,
  // with no catalog, what the brand is.
  const approved_facts = [item ? `${product}${price ? ` is listed at ${price}` : " is on the product list"}.` : `${business.name} sells ${business.category}.`];
  const which = input.otherConcepts.length % 3;

  if (which === 1) {
    return {
      title: `What they use now, next to ${product}`,
      situation: `Someone already owns a way to deal with "${term}" and half believes it works. ${objection ? `Their doubt about switching: ${objection}.` : "Switching feels like admitting the old thing failed."}`,
      hypothesis: `Test whether a plain side-by-side of the thing they use now and ${product} is more persuasive than showing ${product} alone, because the doubt is not "does it work" but "is it different from what I have".`,
      unknowns: ["Whether the brand can show a generic alternative without naming a rival."],
      differs_from: null,
      format: `${durationSec}-second product demonstration`,
      hooks: {
        primary: `The one you have, and this one, same spot, same light`,
        alternatives: [`Nobody shows you these side by side`, `I kept both for a week`],
      },
      script: {
        direction: {
          show: `What most people use now, shot plainly and unbranded, then ${product} in the same spot and light, then ${product} in use. No text over the comparison.`,
          say: `Describe the one difference the viewer would notice for themselves, without naming another brand and without saying theirs is bad.`,
          prove: `One visible difference the camera can show, as the ${page} describes ${product}. No claimed result.`,
        },
        cta,
        duration_seconds: durationSec,
      },
      shot_list: [
        `The generic alternative on a plain surface, label turned away.`,
        `${product} placed beside it in the same frame and light.`,
        `${product} in use, hands in frame, one continuous shot.`,
        `A close shot of ${product} for the close, with the listed price on screen.`,
      ],
      approved_facts,
      outcomes: {
        if_better: "Comparison is the persuasion for this audience; the next test compares on a second visible difference.",
        if_same: "The comparison did not move them; keep the concept and open on the alternative hook before changing it.",
        if_worse: "Seeing the old thing reminds them it is fine; the next test drops the comparison and opens on the customer's moment.",
      },
      priority_reason: `Nothing on file shows an ad from you that puts ${product} beside what people use instead.`,
      guardrail,
    };
  }
  if (which === 2) {
    return {
      title: `One take, start to finish`,
      situation: `Someone believes ${product} might help with "${term}" but expects it to be fiddly, slow or a chore. ${objection ? `In their words: ${objection}.` : "The effort is the objection, not the price."}`,
      hypothesis: `Test whether one unbroken shot of ${product} used start to finish is more persuasive than an edited sequence, because the doubt is effort, and cuts hide effort while a single take cannot.`,
      unknowns: ["Whether the whole use fits in one take at this length."],
      differs_from: null,
      format: `${durationSec}-second single-take demo`,
      hooks: {
        primary: `No cuts. Start to finish, this is all it takes`,
        alternatives: [`I timed it so you don't have to`, `Watch the clock in the corner`],
      },
      script: {
        direction: {
          show: `${product} from unopened to finished in one continuous shot, held two seconds on the result. The clock, the light or the background must not change.`,
          say: `Talk through what you are doing as you do it, as you would to a friend. Let the lack of cuts make the point about how easy it is.`,
          prove: `That it really is one take. Nothing else needs proving; do not add a result claim.`,
        },
        cta,
        duration_seconds: durationSec,
      },
      shot_list: [
        `${product} unopened, in frame with whatever it is used with.`,
        `The whole use in one continuous take, phone on a stand.`,
        `Two seconds held on the finished state.`,
        `A close shot of ${product} for the close, with the listed price on screen.`,
      ],
      approved_facts,
      outcomes: {
        if_better: "Ease is what sells this; the next test keeps the single take and changes only the setting.",
        if_same: "The single take neither helped nor hurt; test the second hook before changing the concept.",
        if_worse: "They wanted to see the problem, not the process; the next test opens on the customer's moment.",
      },
      priority_reason: `The research input reads like a task people put off, and nothing on file shows an ad from you that makes the doing look short.`,
      guardrail,
    };
  }
  return {
    title: `The moment before "${term}"`,
    situation: `Someone is in the middle of the problem people mean when they search "${term}". They have tried the obvious thing and it did not hold. ${objection ? `Their doubt: ${objection}.` : "They are not sure a product changes anything."}`,
    hypothesis: `Test whether opening on the customer's own moment of frustration is more persuasive than opening on ${product} itself, because the search phrase suggests people describe the problem before they look for a product.`,
    unknowns: ["Whether the brand has footage of the problem itself, not only of the product."],
    differs_from: null,
    format: `${durationSec}-second talking head`,
    hooks: {
      primary: `This is what people mean by "${term}"`,
      alternatives: [`I kept trying to fix "${term}" the wrong way`, `The part of "${term}" nobody shows you`],
    },
    script: {
      direction: {
        show: `The problem people mean by "${term}", in a real setting with the light as it is, then ${product} put to use by one person, then the same view after. No before-and-after framing, just the use.`,
        say: `Name the problem the way the customer does, then say plainly what ${product} does about it. No promise of a result, just what changes and why.`,
        prove: `One thing the viewer can check: what ${product} is, as the ${page} lists it. Nothing invented.`,
      },
      cta,
      duration_seconds: durationSec,
    },
    shot_list: [
      `The problem in a real setting, held two seconds before anything is said.`,
      `${product} in use, one continuous shot, hands and product in frame.`,
      `The same view after, same light, no text over it.`,
      `A close shot of ${product} for the close, with the listed price on screen.`,
    ],
    approved_facts,
    outcomes: {
      if_better: "Opening on the customer's moment works for this audience; write the next test as a second moment from the same customer.",
      if_same: "The opening did not decide it; test the same concept with the second hook before changing the concept.",
      if_worse: "This audience wants the product first; the next test opens on the item in use and keeps the customer's words for the close.",
    },
    priority_reason: `The research input shows people describe this problem in their own words, and nothing on file shows an ad from you that opens on it.`,
    guardrail,
  };
}

export function defaultConceptWriter(models?: { flash: string; pro: string }): ConceptWriter {
  if (!isGeminiConfigured) return async (input) => fallbackConceptWrite(input);
  return async (input, rules) => (await writeConceptWithGemini(input, rules, models)).value;
}
