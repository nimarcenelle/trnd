import type { Business, BusinessBrief, PickSignal, Service } from "@/lib/db/types";
import type { CampaignSignalBrief } from "@/lib/recommend/four-signals";
import { isOnlineBusiness } from "@/lib/signals/geo";

/**
 * The pick writer's prompt: one call per pick, returning the finding, the
 * line that says what to run, the guardrail, and three scripts.
 *
 * What is deliberately absent: scores, grades, meters and narrative reads.
 * The founder took all of them off the page, and a writer handed a "7.4/10"
 * writes copy about the grade. The metric's number is absent too. The page
 * prints it once, and a model that never saw it cannot repeat it.
 */
export const PICK_PROMPT_VERSION = "pick-1";

export interface PickPromptCtx {
  business: Business;
  term: string;
  /** What was measured and which way it moved, from formatMetric, without
   * the figure. Null when nothing was measured. */
  movement: { label: string; direction: "up" | "down" | "flat"; window: string } | null;
  matchedService: Service | null;
  services: Service[];
  brief: BusinessBrief | null;
  signals: CampaignSignalBrief;
  /** The evidence rows already computed for the page, claims only. */
  evidence: { signal: PickSignal; claim: string }[];
  /** Script length in seconds. */
  durationSec: number;
}

const THEME_WORDS: Record<string, string> = {
  education: "teaching something",
  offer: "a price or deal",
  scarcity: "a deadline or limited run",
  social_proof: "customer proof",
  speed: "speed and convenience",
  novelty: "something new",
};

const PLATFORM_NAMES: Record<string, string> = {
  meta: "Meta (Reels and Stories)",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  google: "Google",
};

/** "$68", "$3.50". */
export function formatPrice(cents: number | null | undefined): string | null {
  return typeof cents === "number" && cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}` : null;
}

/** The whole catalog, as far as a prompt can hold. The copy may promise
 * these and nothing else. */
const CATALOG_MAX = 90;

function catalogBlock(ctx: PickPromptCtx, online: boolean): string {
  const active = ctx.services.filter((s) => s.is_active !== false).slice(0, CATALOG_MAX);
  if (active.length === 0) return "";
  return [
    online ? "CATALOG (everything the brand sells, at its listed price):" : "MENU (everything the business sells, at its listed price):",
    ...active.map((s) => {
      const p = formatPrice(s.price_cents);
      return `- ${s.name}${p ? ` (${p})` : ""}${s.description ? `: ${s.description.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
    }),
    "HARD RULE: the scripts may promise only these items at these prices. No discounts, free shipping, bundles, guarantees, results or timelines unless they are listed above.",
  ].join("\n");
}

function customerBlock({ signals }: PickPromptCtx): string {
  const tc = signals.targetCustomer;
  if (!tc) return "";
  return [
    `WHO THE AD IS FOR (one person, not a demographic): ${tc.who}`,
    tc.vocabulary.length > 0 ? `Their words for it (the scripts use these, not the brand's): ${tc.vocabulary.slice(0, 12).join(", ")}.` : "",
    tc.triggers.length > 0 ? `What makes them buy: ${tc.triggers.slice(0, 4).join("; ")}.` : "",
    tc.objections.length > 0 ? `Why they hesitate (each script answers one, without calling it an objection): ${tc.objections.slice(0, 4).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function rivalBlock({ signals }: PickPromptCtx): string {
  if (signals.rivalLines.length === 0 && signals.rivalThemes.length === 0) return "";
  const lead = signals.rivalThemes.slice(0, 2).map((t) => THEME_WORDS[t.theme] ?? t.theme);
  return [
    "WHAT DIRECT RIVALS ALREADY SAY (never echo a line or an angle here, never name a rival):",
    ...signals.rivalLines.map((l) => `- ${l}`),
    lead.length > 0 ? `Their ads mostly lean on ${lead.join(" and ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function brandBlock({ signals, brief }: PickPromptCtx): string {
  const out: string[] = [];
  const best = signals.ownBestTheme;
  if (best && best.vsAccount >= 1.1) {
    out.push(
      `WHAT HAS WORKED FOR THIS BRAND: its ads built on ${THEME_WORDS[best.theme] ?? best.theme} beat its own account average across ${best.ads} ads. Make one script that shape.`,
    );
  }
  if (signals.ownTopPosts.length > 0) {
    out.push("Its own posts that got the most response (its voice):");
    for (const p of signals.ownTopPosts) out.push(`- "${p.caption.replace(/\s+/g, " ")}"`);
  }
  if (brief?.watchouts.length) out.push(`Never: ${brief.watchouts.slice(0, 3).join(" | ")}`);
  return out.join("\n");
}

/**
 * Shape only. The items and prices are invented for the example and must
 * never reach the copy. Written for a DTC product, because the campaign
 * writer's café examples pull scripts toward a counter and a latte.
 */
const CRAFT_EXAMPLES = [
  "WHAT THE DIFFERENCE LOOKS LIKE (shape only, never reuse these words, items or numbers):",
  `- Catalog voice, fails: "Our filtered showerhead removes chlorine and heavy metals."`,
  `  Works: "That white crust on the showerhead is in the water you wash with."`,
  `- Spec sheet, fails: "15-stage filtration with KDF-55 media."`,
  `  Works: "Twists on in a minute. No plumber. $68."`,
  `- Generic, fails: "Elevate your self-care routine."`,
  `  Works: "Same shower, same shampoo. One part changed."`,
  `- Unshootable, fails: visual "A lifestyle montage of happy customers."`,
  `  Works: visual "Close on a thumb wiping white scale off the showerhead face."`,
].join("\n");

export function buildPickPrompt(ctx: PickPromptCtx): string {
  const { business, term, movement, matchedService, signals, evidence, durationSec } = ctx;
  const online = isOnlineBusiness(business);
  const page = online ? "product page" : "menu";
  const matchedPrice = formatPrice(matchedService?.price_cents);
  const platforms = business.ad_platforms
    .map((p) => PLATFORM_NAMES[p])
    .filter(Boolean)
    .join(", ");
  const direction =
    movement?.direction === "up" ? "rising" : movement?.direction === "down" ? "falling" : "holding steady";

  return [
    online
      ? `You are the creative strategist for ${business.name}, an online DTC brand (${business.category}) selling nationally. You write for its paid social manager, who shoots next week's ads from what you hand over. The brand's location is not a factor: never name a city, a neighborhood or "near you".`
      : `You are the creative strategist for ${business.name}, a ${business.category} business in ${business.city}${business.region ? `, ${business.region}` : ""}. You write for whoever runs its paid social, who shoots next week's ads from what you hand over.`,
    "Every line must pass one test: does it change what they shoot on Tuesday? If it does not, cut it.",
    "",
    `THE TERM, in the customer's words: "${term}"`,
    movement ? `WHY NOW: ${movement.label}, ${direction} ${movement.window}. The page already shows that number. Never write a number or a percentage about it.` : "",
    matchedService
      ? `The ${page} item that answers it: "${matchedService.name}"${matchedPrice ? ` at ${matchedPrice}` : ""}. If another listed item is the truer answer, lead with that one instead.`
      : `Nothing on the ${page} is named for this. Choose the listed item that truly answers it.`,
    business.brand_voice_notes ? `HOW THEY TALK (match this register): ${business.brand_voice_notes}` : "",
    platforms ? `WHERE THEY RUN ADS: ${platforms}.` : "",
    "",
    catalogBlock(ctx, online),
    "",
    customerBlock(ctx),
    "",
    rivalBlock(ctx),
    "",
    brandBlock(ctx),
    "",
    evidence.length > 0
      ? ["WHAT THE PAGE ALREADY SHOWS (facts the brand can check; lean on them, never restate them):", ...evidence.map((e) => `- ${e.claim}`)].join("\n")
      : "",
    "",
    `FORMAT: every script runs ${durationSec} seconds${typeof signals.medianDurationSec === "number" ? ", the length of the short-form video winning on this term" : ""}.`,
    "",
    CRAFT_EXAMPLES,
    "",
    "Return JSON:",
    `- finding: the gap between how the customer says it and how the brand says it, in this shape: Your customers are searching "${term}." Your ${page} says "<the brand's own words for the item this ad sells>." The item in the finding is the item in bet_what, even when it is not the matched item above. When the brand already uses the customer's words for that item, there is no word gap, so name what the ${page} puts first instead: Your customers are searching "${term}." Your ${page} leads with "<the spec, feature or claim it leads with>." Quote the term exactly. No numbers, no percentages, no advice.`,
    `- bet_what: one line saying what to run: which item, which angle, which platform. Under 20 words. No budget and no numbers except a listed price.`,
    `- guardrail: one sentence naming the platform policy or brand-safety risk specific to this ad, and the exact line or shot to avoid. Check Meta's personal attributes rule (copy cannot imply the viewer has a condition, a body type or money trouble: "your thinning hair" is rejected, "for thinning hair" is fine), health, beauty and supplement claims (no cure, treat, prevent or guaranteed results), and before and after images (restricted on Meta and TikTok for weight loss, skin and cosmetic results). null when nothing specific applies. Never a generic reminder.`,
    `- scripts: exactly 3 short-form video scripts, each on a different thesis. Pick the three that fit this term, for example: price anchor (the listed price is the hook), problem first (open on the problem the term names), before and after (only when the guardrail allows it for this item), the item in use in one take, the switch from what they use now (never name a rival). Each has:`,
    `  - variant_label: 2 to 4 words naming the thesis, e.g. "Problem first".`,
    `  - thesis: one sentence on why this version could win with this customer.`,
    `  - hook: what is said or shown in the first two seconds. A line a person would say, under 12 words, not a question.`,
    `  - direction: guidance for the person making the video, never the lines to read. The hook is the only verbatim line. show: what the video should show, in one to three sentences: the setting, the item in use, what one person with a phone can shoot, what to avoid. say: the argument to make in their own words, one to three sentences; describe the point, do not script it. prove: the one claim to back up and with what (a spec on the page, a customer's words, something the camera can show), or what not to claim.`,
    `  - cta: how to close, naming the item${matchedPrice ? " and its listed price" : ""}. Guidance, under 15 words.`,
    `  - duration_seconds: ${durationSec}.`,
    "",
    "Voice, hard rules:",
    "- Short plain sentences, written like a person. Read every line aloud.",
    "- No em dashes, no arrows, no exclamation marks, no emoji, no hashtags.",
    "- No hype words: revolutionize, unlock, elevate, game-changer, must-have, obsessed, viral, next level, transform, ultimate, seamless, curated.",
    "- No invented results, reviews, awards, discounts, shipping offers or guarantees.",
  ]
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
