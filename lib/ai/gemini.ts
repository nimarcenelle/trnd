/**
 * The only file that imports the Gemini SDK. Model names are resolved from
 * the live ListModels API at first use — never hardcoded from memory — with a
 * documented fallback chain, and cached per process. Every call uses
 * structured JSON output validated with Zod; one retry on violation, then the
 * caller falls back to the deterministic generator.
 */

import { GoogleGenAI, Type, type Schema } from "@google/genai";

import { env } from "@/lib/env";

import type { Business, NewBusinessBrief, Service } from "@/lib/db/types";

import { BRIEF_PROMPT_VERSION } from "./brief";
import type { GeneratedCampaign, GenerationContext } from "./index";
import {
  buildAnglePrompt,
  generateAssetsPrompt,
  PROMPT_VERSION,
  type PromptCtx,
} from "./prompts/generate-campaign";
import { systemInstruction } from "./prompts/system";
import { AngleSchema, BusinessBriefSchema, CampaignAssetsSchema, SiteExtractSchema } from "./schemas";

/** Documented fallback chains, newest first. Used only if listing fails or
 * returns nothing usable. */
const FLASH_FALLBACKS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const PRO_FALLBACKS = ["gemini-2.5-pro", "gemini-1.5-pro"];

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

interface ResolvedModels {
  flash: string;
  pro: string;
}
let resolved: ResolvedModels | null = null;

function isStable(name: string): boolean {
  return !/preview|exp|latest|lite|thinking|image|tts|audio|live|embedding|8b/i.test(name);
}

/** Prefer the highest version number among stable models matching `family`. */
function pickNewest(names: string[], family: "flash" | "pro", fallbacks: string[]): string {
  const candidates = names
    .filter((n) => n.includes(family) && isStable(n))
    .map((n) => {
      const m = n.match(/gemini-(\d+)\.(\d+)/);
      return { name: n, v: m ? Number(m[1]) * 100 + Number(m[2]) : 0 };
    })
    .sort((a, b) => b.v - a.v);
  return candidates[0]?.name ?? fallbacks[0];
}

export async function resolveModels(): Promise<ResolvedModels> {
  if (resolved) return resolved;
  try {
    const names: string[] = [];
    const pager = await getClient().models.list();
    for await (const model of pager) {
      const name = (model.name ?? "").replace(/^models\//, "");
      const actions = model.supportedActions ?? [];
      if (name.startsWith("gemini") && (actions.length === 0 || actions.includes("generateContent"))) {
        names.push(name);
      }
    }
    resolved = {
      flash: pickNewest(names, "flash", FLASH_FALLBACKS),
      pro: pickNewest(names, "pro", PRO_FALLBACKS),
    };
  } catch (err) {
    console.warn("[ai] ListModels failed — using fallback chain:", (err as Error).message);
    resolved = { flash: FLASH_FALLBACKS[0], pro: PRO_FALLBACKS[0] };
  }
  console.log(`[ai] resolved models — flash: ${resolved.flash}, pro: ${resolved.pro}`);
  return resolved;
}

/* ------------------------- response schemas (SDK) ------------------------- */

const audienceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    who: { type: Type.STRING },
    age_range: { type: Type.STRING },
    radius_miles: { type: Type.INTEGER },
    interests: { type: Type.ARRAY, items: { type: Type.STRING } },
    why: { type: Type.STRING },
    angle_type: {
      type: Type.STRING,
      enum: ["education", "offer", "scarcity", "social_proof", "speed", "novelty"],
    },
  },
  required: ["who", "age_range", "radius_miles", "interests", "why", "angle_type"],
};

const angleResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    angle: { type: Type.STRING },
    hook: { type: Type.STRING },
    offer: { type: Type.STRING },
    audience: audienceSchema,
  },
  required: ["angle", "hook", "offer", "audience"],
};

const assetsResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
    primary_texts: { type: Type.ARRAY, items: { type: Type.STRING } },
    scripts: { type: Type.ARRAY, items: { type: Type.STRING } },
    static_briefs: { type: Type.ARRAY, items: { type: Type.STRING } },
    landing_copy: { type: Type.STRING },
  },
  required: ["headlines", "primary_texts", "scripts", "static_briefs", "landing_copy"],
};

/* --------------------------------- calls --------------------------------- */

async function structuredCall<T>(
  model: string,
  prompt: string,
  responseSchema: Schema,
  validate: (data: unknown) => T,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await getClient().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction(),
        responseMimeType: "application/json",
        responseSchema,
        temperature: attempt === 0 ? 0.8 : 0.4,
      },
    });
    try {
      return validate(JSON.parse(res.text ?? ""));
    } catch (err) {
      lastError = err;
      console.warn(`[ai] schema violation from ${model} (attempt ${attempt + 1}):`, (err as Error).message);
    }
  }
  throw lastError;
}

export async function generateWithGemini(ctx: GenerationContext): Promise<GeneratedCampaign> {
  const models = await resolveModels();
  const promptCtx: PromptCtx = ctx;

  // Creative calls run on Pro per the brief; Flash is reserved for
  // classification/ranking-type calls.
  const angle = await structuredCall(
    models.pro,
    buildAnglePrompt(promptCtx),
    angleResponseSchema,
    (d) => AngleSchema.parse(d),
  );
  const assets = await structuredCall(
    models.pro,
    generateAssetsPrompt(promptCtx, angle),
    assetsResponseSchema,
    (d) => CampaignAssetsSchema.parse(d),
  );

  return {
    result: { angle, assets },
    model_used: models.pro,
    prompt_version: PROMPT_VERSION,
  };
}

const briefResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    does_well: { type: Type.ARRAY, items: { type: Type.STRING } },
    moat: { type: Type.STRING },
    advantages: { type: Type.ARRAY, items: { type: Type.STRING } },
    watchouts: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["does_well", "moat", "advantages", "watchouts"],
};

export async function generateBriefWithGemini(
  business: Business,
  services: Service[],
): Promise<NewBusinessBrief> {
  const models = await resolveModels();
  const menu = services
    .filter((s) => s.is_active)
    .map((s) => `${s.name}${s.price_cents ? ` ($${Math.round(s.price_cents / 100)})` : ""}`)
    .join(", ");
  const prompt = [
    `Positioning read for a small business that just joined TRND.`,
    `BUSINESS: ${business.name} — ${business.category} in ${business.city}${business.region ? `, ${business.region}` : ""} (${business.radius_miles}mi radius, price band ${business.price_band ?? "$$"}).`,
    `SELLS: ${menu || "not specified"}.`,
    business.brand_voice_notes ? `VOICE: ${business.brand_voice_notes}` : "",
    `Return JSON: does_well (2-4 concrete strengths), moat (one paragraph — what a competitor can't copy),`,
    `advantages (2-4 edges to press in paid ads), watchouts (2-4 things to AVOID in marketing/ads for this exact category, including platform-policy pitfalls).`,
    `Each item one sentence. Specific to THIS business, never generic.`,
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = await structuredCall(models.flash, prompt, briefResponseSchema, (d) =>
    BusinessBriefSchema.parse(d),
  );
  return {
    business_id: business.id,
    ...parsed,
    model_used: models.flash,
    prompt_version: BRIEF_PROMPT_VERSION,
  };
}

const siteExtractResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
    region: { type: Type.STRING, nullable: true },
    services: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, price: { type: Type.STRING } },
        required: ["name", "price"],
      },
    },
    voice_hint: { type: Type.STRING, nullable: true },
  },
  required: ["services"],
};

export async function extractSiteWithGemini(html: string, url: string) {
  const { CATEGORIES } = await import("@/lib/db/types");
  const models = await resolveModels();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 15000);
  const prompt = [
    `Extract structured business facts from this website (${url}).`,
    `Return: name, category (EXACTLY one of: ${CATEGORIES.join(" | ")} — or null),`,
    `city, region (US state abbrev if visible), services (offerings/menu items WITH a visible price, price in dollars as a plain number string),`,
    `voice_hint (one sentence describing the brand's tone, from their own copy).`,
    `Only report what is actually on the page — nulls beat guesses.`,
    `PAGE TEXT:\n${text}`,
  ].join("\n");
  const parsed = await structuredCall(models.flash, prompt, siteExtractResponseSchema, (d) =>
    SiteExtractSchema.parse(d),
  );
  const category = (CATEGORIES as readonly string[]).includes(parsed.category ?? "")
    ? (parsed.category as (typeof CATEGORIES)[number])
    : undefined;
  return {
    name: parsed.name ?? undefined,
    category,
    city: parsed.city ?? undefined,
    region: parsed.region ?? undefined,
    services: parsed.services,
    voiceHint: parsed.voice_hint ?? undefined,
  };
}
