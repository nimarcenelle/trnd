/**
 * The one generation entrypoint the app calls. Prefers the model when
 * OPENAI_API_KEY is set (lib/ai/openai.ts); otherwise — or on schema
 * violation after one retry — falls back to the deterministic template
 * generator so every screen downstream always works (BLOCKED.md).
 */

import type { Business, BusinessBrief, Opportunity, Service, Signal } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";
import type { CampaignSignalBrief } from "@/lib/recommend/four-signals";

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
  /** Every active service — the only things the copy may promise. */
  services?: Service[];
  /** The founding analysis — campaigns are written to fit it. */
  brief: BusinessBrief | null;
  /** The owner's one-line steer for this build, from the pick's Ask box. */
  direction?: string | null;
  /** The four signals behind this pick: who the ad is for, what the direct
   * rivals are saying, what has worked for this business, the winning format. */
  signals?: CampaignSignalBrief | null;
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
  if (isModelConfigured) {
    try {
      const { generateWithModel } = await import("./openai");
      return await generateWithModel(ctx, onStatus);
    } catch (err) {
      console.warn(
        "[ai] model generation failed — using deterministic fallback:",
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
