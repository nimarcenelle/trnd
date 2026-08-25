/**
 * The one generation entrypoint the app calls. Prefers Gemini when
 * GEMINI_API_KEY is set (lib/ai/gemini.ts); otherwise — or on schema
 * violation after one retry — falls back to the deterministic template
 * generator so every screen downstream always works (BLOCKED.md).
 */

import type { Business, BusinessBrief, Opportunity, Service, Signal } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";

import {
  FALLBACK_MODEL_ID,
  FALLBACK_PROMPT_VERSION,
  generateFallbackCampaign,
} from "./fallback";
import type { GenerationResult } from "./schemas";

export interface GenerationContext {
  business: Business;
  signal: Signal;
  opportunity: Opportunity;
  service: Service | null;
  /** The founding analysis — campaigns are written to fit it. */
  brief: BusinessBrief | null;
}

export interface GeneratedCampaign {
  result: GenerationResult;
  model_used: string;
  prompt_version: string;
}

export async function generateCampaign(
  ctx: GenerationContext,
  onStatus: (label: string) => void = () => {},
): Promise<GeneratedCampaign> {
  if (isGeminiConfigured) {
    try {
      const { generateWithGemini } = await import("./gemini");
      return await generateWithGemini(ctx, onStatus);
    } catch (err) {
      console.warn(
        "[ai] Gemini generation failed — using deterministic fallback:",
        (err as Error).message,
      );
    }
  }
  return {
    result: generateFallbackCampaign(ctx),
    model_used: FALLBACK_MODEL_ID,
    prompt_version: FALLBACK_PROMPT_VERSION,
  };
}
