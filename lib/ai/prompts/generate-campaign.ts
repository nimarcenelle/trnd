import type { Business, BusinessBrief, Opportunity, Service, Signal } from "@/lib/db/types";

export const PROMPT_VERSION = "gemini-3";

export interface PromptCtx {
  business: Business;
  signal: Signal;
  opportunity: Opportunity;
  service: Service | null;
  brief: BusinessBrief | null;
}

function businessBlock({ business, service, brief }: PromptCtx): string {
  return [
    `BUSINESS: ${business.name} — ${business.category} in ${business.city}${business.region ? ", " + business.region : ""}.`,
    `Radius: ${business.radius_miles} miles. Price band: ${business.price_band ?? "unknown"}.`,
    service
      ? `Matched service: ${service.name}${service.price_cents ? ` ($${Math.round(service.price_cents / 100)})` : ""}.`
      : "No direct service match — recommend a sensible new offer.",
    business.brand_voice_notes ? `Owner's voice notes: ${business.brand_voice_notes}` : "",
    ...(brief
      ? [
          `SNAPSHOT (how TRND reads this business — the campaign must fit it):`,
          brief.positioning ? `Positioning: ${brief.positioning}` : "",
          brief.advantages.length > 0 ? `Edges to press: ${brief.advantages.slice(0, 2).join(" ")}` : "",
          brief.watchouts.length > 0 ? `Never: ${brief.watchouts.slice(0, 2).join(" ")}` : "",
        ]
      : []),
  ]
    .filter(Boolean)
    .join("\n");
}

function signalBlock({ signal, opportunity }: PromptCtx): string {
  return [
    `DEMAND SIGNAL: "${signal.term}" (${signal.metric_type.replace(/_/g, " ")}, source ${signal.source}).`,
    signal.delta_pct !== null ? `It is up ${Math.round(signal.delta_pct)}% week over week.` : "",
    `Opportunity score: ${opportunity.score}/10. Reasoning: ${opportunity.rationale}`,
    opportunity.competitor_gap ? `Competitor read: ${opportunity.competitor_gap}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Call 2 of the brief — buildAngle. */
export function buildAnglePrompt(ctx: PromptCtx): string {
  return [
    businessBlock(ctx),
    "",
    signalBlock(ctx),
    "",
    "Build the positioning for one ad campaign this week:",
    "- angle: the specific claim the ad makes and why it wins now (2-3 sentences).",
    "- hook: the first line that stops the scroll — use the words customers themselves",
    "  use for this trend, not marketing vocabulary.",
    "- offer: a concrete offer with a real price (use the matched service's actual",
    "  price when there is one) or unmistakably clear terms.",
    "- audience: who to target and why — pick the snapshot customer segment this",
    "  trend actually reaches; include angle_type, one of:",
    "  education | offer | scarcity | social_proof | speed | novelty.",
    `- audience.radius_miles must be ${ctx.business.radius_miles}.`,
  ].join("\n");
}

/** Call 3 of the brief — generateCampaign. */
export function generateAssetsPrompt(
  ctx: PromptCtx,
  angle: { angle: string; hook: string; offer: string },
): string {
  return [
    businessBlock(ctx),
    "",
    signalBlock(ctx),
    "",
    `THE ANGLE (already decided): ${angle.angle}`,
    `HOOK: ${angle.hook}`,
    `OFFER: ${angle.offer}`,
    "",
    "Produce the finished campaign assets:",
    "- headlines: exactly 5, each under 60 characters.",
    "- primary_texts: exactly 3 paid-social primary texts, 2-4 sentences each.",
    "- scripts: exactly 3 short-form video scripts with timestamped beats",
    "  (HOOK / body / CTA), each shootable by an owner on a phone.",
    "- static_briefs: exactly 3 one-paragraph briefs for static images —",
    "  IMAGE / TEXT OVERLAY / FOOTER structure. Each must be shootable by the",
    "  owner with a phone, in their own space, in under 15 minutes — name the",
    "  exact spot, subject, and light, never a studio setup.",
    "- landing_copy: a short landing section in markdown — headline, one",
    "  paragraph, three proof bullets, one CTA line with the offer.",
  ].join("\n");
}
