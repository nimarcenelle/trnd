import type { Business, BusinessBrief, Opportunity, Service, Signal } from "@/lib/db/types";

/** gemini-6: the owner can steer a build with a one-line direction from the pick's Ask box. */
export const PROMPT_VERSION = "gemini-6";

export interface PromptCtx {
  business: Business;
  signal: Signal;
  opportunity: Opportunity;
  service: Service | null;
  services?: Service[];
  brief: BusinessBrief | null;
  /** The owner's steer for this build, when they asked for one — "do this
   * for the deep-tissue massage instead", "lead with the Tuesday special". */
  direction?: string | null;
}

/** The owner's direction outranks the judge's taste, never the menu. */
function directionBlock({ direction }: PromptCtx): string {
  if (!direction) return "";
  return [
    `THE OWNER'S DIRECTION for this build — follow it in every angle and asset:`,
    `"${direction.replace(/\s+/g, " ").trim()}"`,
    `It decides which service, offer, audience, or angle the campaign leads with. It cannot add anything the MENU doesn't list — if it asks for an unlisted promise, ride the closest listed item and never invent the rest.`,
  ].join("\n");
}

const price = (s: Service) => (s.price_cents != null ? ` ($${Math.round(s.price_cents / 100)})` : "");

/** The menu is the contract: the copy may promise these and nothing else. */
function menuBlock({ services, service }: PromptCtx): string {
  const active = (services ?? (service ? [service] : [])).filter((s) => s.is_active !== false);
  if (active.length === 0) return "";
  return [
    `MENU — every service this business offers, with the price the owner listed:`,
    ...active.slice(0, 40).map((s) => `- ${s.name}${price(s)}${s.description ? ` — ${s.description}` : ""}`),
    `HARD RULE: the copy may promise ONLY what is on this menu. If pickup, a van, house calls, same-day turnaround, free anything, guarantees, financing, loaners, or specific hours are not listed here, they do not exist — do not offer them, do not imply them. A listed "Delivery" means you deliver it back; it does not mean you pick it up. Every offer names a real menu item at its listed price.`,
  ].join("\n");
}

function businessBlock(ctx: PromptCtx): string {
  const { business, service, brief } = ctx;
  return [
    `BUSINESS: ${business.name} — ${business.category} in ${business.city}${business.region ? ", " + business.region : ""}.`,
    `Radius: ${business.radius_miles} miles. Price band: ${business.price_band ?? "unknown"}.`,
    service
      ? `Matched service: ${service.name}${service.price_cents ? ` ($${Math.round(service.price_cents / 100)})` : ""}.`
      : "No direct service match — recommend a sensible new offer.",
    business.brand_voice_notes ? `Owner's voice notes: ${business.brand_voice_notes}` : "",
    menuBlock(ctx),
    directionBlock(ctx),
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

const ANGLE_FIELDS = (ctx: PromptCtx) => [
  "- angle: the specific claim the ad makes and why it wins now (2-3 sentences).",
  "- hook: the first line that stops the scroll — use the words customers themselves",
  "  use for this trend, not marketing vocabulary.",
  "- offer: a concrete offer with a real price (use the matched service's actual",
  "  price when there is one) or unmistakably clear terms.",
  "- audience: who to target and why — pick the snapshot customer segment this",
  "  trend actually reaches; include angle_type, one of:",
  "  education | offer | scarcity | social_proof | speed | novelty.",
  `- audience.radius_miles must be ${ctx.business.radius_miles}.`,
];

/** Call 2 of the brief — an angle slate. Three genuinely different ways to
 * ride the signal, so the judge picks the best instead of the first. */
export function buildAngleSlatePrompt(ctx: PromptCtx): string {
  return [
    businessBlock(ctx),
    "",
    signalBlock(ctx),
    "",
    "Build THREE genuinely different positionings for one ad campaign this week —",
    "three distinct routes into the same demand, not three phrasings of one idea.",
    ...(ctx.direction ? ["All three must honor THE OWNER'S DIRECTION above — vary the route, not the destination."] : []),
    "Each must use a different angle_type, attack from a different motive (e.g. one",
    "hijacks the trend's own comparison, one leads with the offer, one educates),",
    "and stand alone as a campaign an owner would run. For each angle return:",
    ...ANGLE_FIELDS(ctx),
    "",
    "Order them however you like — a separate judge picks the winner.",
  ].join("\n");
}

/** Flash judge: pick the slate's winner against the signal and the snapshot. */
export function buildAngleJudgePrompt(
  ctx: PromptCtx,
  angles: { angle: string; hook: string; offer: string; audience: { angle_type: string } }[],
): string {
  return [
    businessBlock(ctx),
    "",
    signalBlock(ctx),
    "",
    "Three candidate ad angles follow. Pick the ONE a sharp local marketer would",
    "actually run this week. Judge: does the hook stop the scroll for THIS trend's",
    "audience; is the claim credible from THIS business specifically; is the offer",
    "concrete enough to act on; does it avoid the snapshot's watchouts. Prefer the",
    "angle a competitor is least able to copy next week.",
    ...(ctx.direction ? ["An angle that ignores THE OWNER'S DIRECTION above loses, however sharp it is."] : []),
    "Return winner (0, 1, or 2) and reason (one sentence, shown in logs).",
    "",
    "CANDIDATES:",
    ...angles.map(
      (a, i) =>
        `${i}. [${a.audience.angle_type}] HOOK: ${a.hook} | OFFER: ${a.offer} | ANGLE: ${a.angle}`,
    ),
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
