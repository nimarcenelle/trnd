import type { Business, BusinessBrief, Opportunity, Service, Signal } from "@/lib/db/types";

/** gemini-8: craft rules, three real routes into the demand, a copy chief. */
export const PROMPT_VERSION = "gemini-8";

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

const price = (s: Service) =>
  s.price_cents != null ? ` ($${(s.price_cents / 100).toFixed(2).replace(/\.00$/, "")})` : "";

/** The whole menu, not the first forty lines: a café's evening cocktails
 * and weekend specials sit at the bottom of an eighty-item list, and they
 * are exactly the items an ad about Friday should name. */
const MENU_MAX = 90;

/** The menu is the contract: the copy may promise these and nothing else. */
function menuBlock({ services, service }: PromptCtx): string {
  const active = (services ?? (service ? [service] : [])).filter((s) => s.is_active !== false);
  if (active.length === 0) return "";
  return [
    `MENU — everything this business sells, with the price the owner listed:`,
    ...active.slice(0, MENU_MAX).map((s) => `- ${s.name}${price(s)}${s.description ? ` — ${s.description}` : ""}`),
    `HARD RULE: the copy may promise ONLY what is on this menu, at these prices. If pickup, delivery, a van, house calls, same-day turnaround, free anything, guarantees, financing, loaners, or specific hours are not listed here, they do not exist — do not offer them, do not imply them. Every offer names a real menu item at its listed price.`,
  ].join("\n");
}

function businessBlock(ctx: PromptCtx): string {
  const { business, service, brief } = ctx;
  return [
    `BUSINESS: ${business.name} — ${business.category} in ${business.city}${business.region ? ", " + business.region : ""}.`,
    `Radius: ${business.radius_miles} miles. Price band: ${business.price_band ?? "unknown"}.`,
    service
      ? `Matched menu item: ${service.name}${price(service)} — the scorer's best guess at what this demand means on the menu. A starting point, not a constraint: if another MENU item is the truer answer to what these people want (the search says "beans", the thing they will actually buy on the block is the cup), lead with that item instead and say so in the angle.`
      : "No direct menu match — pick the menu item that best answers this demand, or recommend a sensible new offer built only from listed items.",
    business.brand_voice_notes
      ? `HOW THEY TALK (their own words, from their site or the owner — match this register): ${business.brand_voice_notes}`
      : "",
    menuBlock(ctx),
    directionBlock(ctx),
    ...(brief
      ? [
          `SNAPSHOT (how TRND reads this business — the campaign must fit it):`,
          brief.positioning ? `Positioning: ${brief.positioning}` : "",
          brief.customer_segments.length > 0 ? `Who buys: ${brief.customer_segments.slice(0, 3).join(" | ")}` : "",
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
    signal.delta_pct !== null ? `It is up ${Math.round(signal.delta_pct)}% on the previous period.` : "",
    `Opportunity score: ${opportunity.score}/10. Reasoning: ${opportunity.rationale}`,
    opportunity.competitor_gap ? `Competitor read: ${opportunity.competitor_gap}` : "",
    `The signal is why NOW. It is not the headline: nobody buys "a trend", they buy the thing on the menu that the trend is about.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The shape of a line that works, shown once so the model has a target
 * instead of only a fence. Illustrations of SHAPE — the items and prices
 * are invented for the example and must never leak into the copy.
 */
const CRAFT_EXAMPLES = [
  "WHAT THE DIFFERENCE LOOKS LIKE (shape only — never reuse these words or numbers):",
  `- Catalog voice, fails: "You are looking for El Salvador coffee beans to brew at home."`,
  `  Works: "El Salvador Mapache Estate, $24 a bag, ground however you brew."`,
  `- Lecture, fails: "The natural process leaves the fruit on the bean during drying."`,
  `  Works: "Burundi Ruvumu tastes like blueberries. $25, and it's the fruit talking."`,
  `- Spec sheet, fails: "Light roast coffee beans need a constant water temperature to extract properly."`,
  `  Works: "Cold brew, $5, poured on the walk between Glenwood and the park."`,
  `- Generic, fails: "Elevate your morning routine with our specialty coffee experience."`,
  `  Works: "Sunday Morning is a latte. Brown sugar, cinnamon, sea salt, $6.50, here till 4."`,
].join("\n");

const ANGLE_FIELDS = (ctx: PromptCtx) => [
  "- angle: the one claim the ad makes and why it wins this week — 2-3 sentences",
  "  written to the owner, naming the menu item and price it leads with.",
  "- hook: the opening line of the ad itself. A line a person would say. It names",
  "  something real — the item, the price, the time, the place, the moment — and",
  "  earns the next line. Under 90 characters. Not a label, not a spec, not a",
  "  question, never \"you are looking for\".",
  "- offer: the item and its listed price, plus the one condition that makes it an",
  "  offer (a day, a time, a place) — ten words at most. It is set over the photo",
  "  in the ad. \"$6.75 Gold Rush latte, hot or iced, this week\" — never a sentence.",
  "- audience: who to target and why — the snapshot customer this demand actually",
  "  reaches, in one concrete sentence (their situation, not their demographics);",
  "  include angle_type, one of: education | offer | scarcity | social_proof |",
  "  speed | novelty.",
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
    CRAFT_EXAMPLES,
    "",
    "Build THREE genuinely different campaigns for this week — three routes into",
    "the same demand, not three phrasings of one idea. Use these three routes:",
    "1. THE THING: the menu item and its price, plainly and confidently, with the",
    "   one detail that makes it worth crossing town for. (angle_type: offer)",
    "2. THE MOMENT: a time, day, season, weather, or occasion happening THIS WEEK",
    "   in which this item is the right call — and the ad names that moment.",
    "   (angle_type: scarcity, speed, or novelty — whichever the moment truly is)",
    "3. THE PERSON: one specific customer's situation, said in their words, and the",
    "   line that meets them there. (angle_type: social_proof or education — and",
    "   education only when the explanation is itself a pleasure to read)",
    ...(ctx.direction ? ["All three must honor THE OWNER'S DIRECTION above — vary the route, not the destination."] : []),
    "Each must stand alone as a campaign a sharp owner would run tomorrow. Each",
    "hook must pass the read-aloud test. For each angle return:",
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
    "Three candidate ad angles follow. Pick the ONE a sharp creative director would",
    "actually run this week. Score each on:",
    "- Would a real person say the hook out loud? Catalog voice, spec sheets, and",
    "  lectures lose on this alone.",
    "- Does it name a real menu item, a real price, and a real reason for THIS week?",
    "- Is it about the customer's moment rather than the product's mechanics?",
    "- Is the claim credible from THIS business specifically, and inside the",
    "  snapshot's watchouts?",
    "- Is it the angle a competitor is least able to copy next week?",
    "An education angle wins only when its explanation is genuinely a pleasure to",
    "read — never because it is the safest.",
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
    CRAFT_EXAMPLES,
    "",
    `THE ANGLE (already decided): ${angle.angle}`,
    `HOOK: ${angle.hook}`,
    `OFFER: ${angle.offer}`,
    "",
    "Produce the finished campaign assets. Every line is copy a customer reads,",
    "written to them — never a note to the owner, never a description of the ad.",
    // Meta truncates a headline near 40 characters and hides primary text
    // past ~125 behind "See more". Copy written past those limits is not
    // richer, it is cut off mid-thought in the only place it is ever read.
    "- headlines: exactly 5, each under 40 characters, no trailing period. Five",
    "  different jobs, in this order: the item with its price; the moment (day,",
    "  time, season); the place (the street, the neighborhood, the room); the",
    "  customer's situation in their words; the plain invitation. Shorter wins.",
    "- primary_texts: exactly 3 paid-social primary texts, 1-2 sentences and under",
    "  125 characters each. The first sentence carries the whole offer on its own",
    "  (item, price, and the when or where), because most people never expand the",
    "  rest; the second adds one concrete, sensory detail. Three different",
    "  openings: one starts with the item, one with the time or place, one with",
    "  the customer.",
    "- scripts: exactly 3 short-form video scripts, 15-30 seconds, with",
    "  timestamped beats (HOOK / body / CTA). Each opens on something the phone",
    "  is pointed at — a pour, a door, a hand, a street — not on a sentence. The",
    "  CTA states the item, the price, and the place. Shootable by an owner alone.",
    "- static_briefs: exactly 3 one-paragraph briefs for static images —",
    "  IMAGE / TEXT OVERLAY / FOOTER structure. Each must be shootable by the",
    "  owner with a phone, in their own space, in under 15 minutes — name the",
    "  exact spot, subject, and light, never a studio setup.",
    "  TEXT OVERLAY is six words at most. It is read at thumb speed over a",
    "  photo; a sentence there is wallpaper nobody finishes.",
    "- landing_copy: a short landing section in markdown — headline, one",
    "  paragraph in the same voice, three proof bullets that name real menu items",
    "  or real details, one CTA line with the offer.",
  ].join("\n");
}

/**
 * Call 4 — the copy chief. A second pass by a stricter reader over the
 * finished assets: every line is judged against the craft rules and the
 * menu, weak lines are rewritten, strong lines are kept word for word. The
 * first draft optimises for obeying the schema; this pass optimises for
 * whether a person would run it.
 */
export function buildCopyChiefPrompt(
  ctx: PromptCtx,
  angle: { angle: string; hook: string; offer: string; audience: unknown },
  assets: {
    headlines: string[];
    primary_texts: string[];
    scripts: string[];
    static_briefs: string[];
    landing_copy: string;
  },
): string {
  return [
    `You are the copy chief reviewing finished ad copy for ${ctx.business.name} before the owner sees it. Your reputation is on every line.`,
    "",
    businessBlock(ctx),
    "",
    CRAFT_EXAMPLES,
    "",
    "Read every line below aloud and mark it PASS or FAIL against these tests:",
    "1. Would a real person say it to a friend? Catalog voice (\"We stock\", \"We",
    "   carry\", \"Order a bag of\"), spec-sheet mechanics, and lecture openers fail.",
    "2. Is it about one concrete thing — an item, a price, a time, a place, a",
    "   moment — rather than a category or a feeling?",
    "3. Does it speak to the customer, never about the campaign or to the owner?",
    "4. Is it free of ad-speak, gimmicks, rhetorical questions, exclamation marks,",
    "   and headlines ending in a period?",
    "5. Is every price, item, hour, and claim on the MENU or in the facts above?",
    "   An invented detail fails even when it reads well.",
    "6. Do the five headlines do five different jobs, and do the three primary",
    "   texts open three different ways?",
    "Rewrite every line that fails — same slot, same length limits (headlines",
    "under 40 characters, primary texts under 125), same voice as the lines that",
    "pass. Keep every passing line word for word. Keep the angle and audience",
    "unless the angle text itself fails test 3. Never add a new number or a new",
    "promise. Return the same JSON shape with your edits applied.",
    "",
    `THE ANGLE: ${angle.angle}`,
    `HOOK: ${angle.hook}`,
    `OFFER: ${angle.offer}`,
    "",
    "THE COPY:",
    JSON.stringify({ angle, assets }),
  ].join("\n");
}
