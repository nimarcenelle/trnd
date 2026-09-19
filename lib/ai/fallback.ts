/**
 * Deterministic campaign generator. This is the guaranteed path: it runs with
 * zero network access and produces brand-voiced, business-specific campaign
 * JSON that validates against the same schemas as the model path. When
 * OPENAI_API_KEY is present the model path is preferred and this becomes the
 * schema-violation fallback (see lib/ai/index.ts and BLOCKED.md).
 *
 * Voice rules from the brief: short declaratives, concrete nouns and real
 * numbers, define by negation then land the positive, address one owner, em
 * dashes for the turn, no hype verbs, no exclamation marks.
 */

import type { Business, Opportunity, Service, Signal } from "@/lib/db/types";

import { GenerationSchema, type GenerationResult } from "./schemas";

import { isOnlineBusiness, NATIONWIDE_RADIUS } from "@/lib/signals/geo";
export const FALLBACK_MODEL_ID = "trnd-template/v1";
export const FALLBACK_PROMPT_VERSION = "fallback-1";

interface Ctx {
  business: Business;
  signal: Signal;
  opportunity: Opportunity;
  service: Service | null;
}

/** Trim to a real limit on a word boundary — copy that gets cut off in the
 * feed reads as a mistake, so it is cut here, on purpose, where it can end
 * on a whole word. */
function clamp(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, "");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * How each category talks about a first purchase. A restaurant guest orders
 * a plate; a med-spa client books a consult; a shop customer walks in. Copy
 * that says "consult — applied to your first visit" about a rib platter is
 * exactly the generic-AI output the brief calls a bug.
 */
interface CategoryVoice {
  /** Education-angle offer: how a first, low-commitment purchase is framed. */
  educationOffer: (offerName: string, p: string) => string;
  /** The booking verb + friction-free close, reused across texts. */
  ctaLine: string;
  bookVerb: string;
  /** Fallback price when no service carries one, by price band. */
  defaultPrice: Record<string, number>;
}

/** "Facial balancing consult" should never become "… consult consult". */
const consultName = (offerName: string, word: string) =>
  new RegExp(word, "i").test(offerName) ? offerName : `${offerName} ${word}`;

const CATEGORY_VOICE: Record<string, CategoryVoice> = {
  "Restaurants & cafés": {
    educationOffer: (o, p) => `${o} — ${p}, this week only`,
    ctaLine: "Reserve in two taps — or just walk in.",
    bookVerb: "Reserve",
    defaultPrice: { $: 12, $$: 24, $$$: 55 },
  },
  "Home services": {
    educationOffer: (o, p) => `${consultName(o, "assessment")} — ${p}, credited to the job`,
    ctaLine: "Book online in two minutes — no phone tag.",
    bookVerb: "Book",
    defaultPrice: { $: 79, $$: 149, $$$: 299 },
  },
  "Health & beauty": {
    educationOffer: (o, p) => `${consultName(o, "consult")} — ${p}, applied to your first visit`,
    ctaLine: "Book online in two minutes — no phone tag.",
    bookVerb: "Book",
    defaultPrice: { $: 39, $$: 89, $$$: 199 },
  },
  "Fitness studios": {
    educationOffer: (o, p) => `Intro ${o.toLowerCase()} session — ${p}`,
    ctaLine: "Grab a spot in two taps — first-timers welcome.",
    bookVerb: "Book",
    defaultPrice: { $: 15, $$: 29, $$$: 59 },
  },
  "Retail & boutiques": {
    educationOffer: (o, p) => `${o} — ${p}, in store and going fast`,
    ctaLine: "Come see it in person — we'll hold it for 24 hours.",
    bookVerb: "Shop",
    defaultPrice: { $: 25, $$: 48, $$$: 120 },
  },
  "Auto services": {
    educationOffer: (o, p) => `${consultName(o, "inspection")} — ${p}, waived with the work`,
    ctaLine: "Book online in two minutes — real quote, no upsell.",
    bookVerb: "Schedule",
    defaultPrice: { $: 49, $$: 99, $$$: 249 },
  },
  "Dental & wellness": {
    educationOffer: (o, p) => `${consultName(o, "consult")} — ${p}, applied to treatment`,
    ctaLine: "Book online in two minutes — no phone tag.",
    bookVerb: "Book",
    defaultPrice: { $: 59, $$: 129, $$$: 249 },
  },
};

const FALLBACK_VOICE: CategoryVoice = {
  educationOffer: (o, p) => `First ${o.toLowerCase()} — ${p}`,
  ctaLine: "Book online in two minutes — no phone tag.",
  bookVerb: "Book",
  defaultPrice: { $: 29, $$: 49, $$$: 99 },
};

const voiceFor = (category: string): CategoryVoice => CATEGORY_VOICE[category] ?? FALLBACK_VOICE;

function price(service: Service | null, business: Business): string {
  if (service?.price_cents) return `$${Math.round(service.price_cents / 100)}`;
  const v = voiceFor(business.category);
  return `$${v.defaultPrice[business.price_band ?? "$$"] ?? v.defaultPrice["$$"]}`;
}

function deltaPhrase(signal: Signal): string {
  if (signal.delta_pct !== null) {
    return `up ${Math.round(signal.delta_pct)}% this week`;
  }
  return "climbing in your area right now";
}

type AngleType = "education" | "offer" | "scarcity" | "social_proof" | "speed" | "novelty";

/** Pick a persuasion shape from what we know — deterministic, explainable. */
export function pickAngleType(ctx: Ctx): AngleType {
  const m = ctx.signal.metric_type;
  if (m === "booking_intent") return "speed";
  if (m === "conversation") return "education";
  if (ctx.service?.price_cents && ctx.service.price_cents >= 15000) return "education";
  if (m === "local_demand") return "scarcity";
  return "offer";
}

export function generateFallbackCampaign(ctx: Ctx): GenerationResult {
  const { business, signal, service } = ctx;
  const term = signal.term.toLowerCase();
  const offerName = service?.name ?? cap(term);
  // An online DTC brand has no city to put in an ad and no radius to target.
  const online = isOnlineBusiness(business);
  const city = business.city;
  const p = price(service, business);
  const angleType = pickAngleType(ctx);
  const radius = online ? NATIONWIDE_RADIUS : business.radius_miles;
  const voice = voiceFor(business.category);

  const angleByType: Record<AngleType, { angle: string; hook: string; offer: string }> = {
    education: {
      angle: `Most people searching "${term}" don't need more — they need it done right. Position ${business.name} as the ${online ? "brand" : `place in ${online ? "online" : city}`} that explains before it sells.`,
      hook: `Three things nobody tells you about ${term}.`,
      offer: voice.educationOffer(offerName, p),
    },
    offer: {
      angle: `Interest in ${term} is ${deltaPhrase(signal)} and ${online ? "few brands are" : `almost nobody in ${online ? "online" : city} is`} advertising it. A clear first-timer offer wins the click.`,
      hook: `${cap(term)} — without the guesswork.`,
      offer: `First ${offerName} — ${p} this week`,
    },
    scarcity: {
      angle: `Demand for ${term}${online ? "" : ` in ${online ? "online" : city}`} outstrips the slots that exist. Say the quiet part: openings are limited, and booking early is the move.`,
      hook: online ? `${cap(term)}, while this week's run lasts.` : `${online ? "online" : city} is booking out ${term}. A few spots are left this week.`,
      offer: `Priority booking for ${offerName} — reserve this week`,
    },
    social_proof: {
      angle: `People trying ${term} want proof it works for people like them. Lead with your regulars, not your menu.`,
      hook: `Why ${online ? "people keep" : `${online ? "online" : city} keeps`} coming back for ${term}.`,
      offer: `${offerName} — ${p} for first-timers`,
    },
    speed: {
      angle: `Searches for ${term} are ${deltaPhrase(signal)} — these are people who want it handled now. Answer with speed, not a brochure.`,
      hook: `Need ${term}? Booked by tonight.`,
      offer: `Same-week ${offerName} — ${voice.bookVerb.toLowerCase()} in two taps`,
    },
    novelty: {
      angle: `${cap(term)} is new enough that no ${online ? "brand" : `one in ${online ? "online" : city}`} owns it yet. First mover gets the association.`,
      hook: online ? `Meet ${term}.` : `${online ? "online" : city}, meet ${term}.`,
      offer: `Introductory ${offerName} — ${p}`,
    },
  };

  const a = angleByType[angleType];

  const audienceWho: Record<string, string> = {
    "Restaurants & cafés": "locals who eat out weekly and decide from their phone",
    "Home services": "homeowners with a problem they want solved this week",
    "Health & beauty": "people already researching treatments like this",
    "Fitness studios": "people actively comparing local studios and classes",
    "Retail & boutiques": "local shoppers who buy from discovery, not search",
    "Auto services": "car owners who fix things when a trigger moment hits",
    "Dental & wellness": "patients comparing providers before they call anyone",
  };

  const result: GenerationResult = {
    angle: {
      angle: a.angle,
      hook: a.hook,
      offer: a.offer,
      audience: {
        who: online ? "people already showing intent for this online" : (audienceWho[business.category] ?? "locals already showing intent for this"),
        age_range: business.category === "Health & beauty" ? "23–45" : "25–54",
        radius_miles: radius,
        interests: [term, business.category.toLowerCase(), ...(online ? [] : [`${online ? "online" : city} local`])],
        why: `They're the people behind the ${deltaPhrase(signal)} signal — warm demand, not cold reach.`,
        angle_type: angleType,
      },
    },
    assets: {
      // Meta clips a headline near 40 characters and hides primary text past
      // ~125 behind "See more", so the deterministic copy is written to the
      // same limits the prompt now asks the model for. `clamp` is the floor
      // under both: a long service name or business name must shorten the
      // line, not push it past the cut.
      headlines: [
        clamp(a.hook, 40),
        clamp(`${cap(term)} in ${online ? "online" : city}`, 40),
        clamp(a.offer, 40),
        clamp(`${cap(term)}, done right`, 40),
        clamp(`${business.name} — ${cap(term)}`, 40),
      ],
      primary_texts: [
        clamp(`${cap(term)} is having a moment in ${online ? "online" : city}. ${a.offer}.`, 125),
        clamp(`Your neighbors are looking for ${term} this week. ${a.offer}.`, 125),
        clamp(`The ${term} worth your money, done daily at ${business.name}. ${a.offer}.`, 125),
      ],
      scripts: [
        `HOOK (0-3s): "${a.hook}"\nPROBLEM (3-10s): Everyone's talking about ${term} — most of the advice is noise.\nPROOF (10-20s): Show the real thing at ${business.name}: hands, process, result. No stock footage.\nCTA (20-30s): "${a.offer}. Link below — takes two minutes."`,
        `HOOK (0-3s): On-screen text: "${cap(term)} — ${deltaPhrase(signal)}."\nSTORY (3-15s): Owner talks straight to camera: why people are asking for this, what actually matters.\nRESULT (15-25s): One real before/after or reaction.\nCTA (25-30s): "We're in ${online ? "online" : city}. ${a.offer}."`,
        `HOOK (0-3s): "${online ? "online" : city}: stop scrolling if you've been thinking about ${term}."\nLIST (3-20s): Three quick things to know before you book anywhere — genuinely useful, no pitch.\nTURN (20-27s): "That's how we do it at ${business.name}."\nCTA (27-30s): "${a.offer}."`,
      ],
      static_briefs: [
        `IMAGE: Tight, real photo of ${term} in progress at ${business.name} — no stock. TEXT OVERLAY: "${a.hook}" BOTTOM BAR: ${a.offer} · ${online ? "online" : city}. Amber CTA button: "${voice.bookVerb} now".`,
        `IMAGE: Split frame — "what you've heard" vs "what it actually is". TEXT OVERLAY: "${cap(term)}, minus the noise." FOOTER: ${business.name}, ${online ? "online" : city} · ${a.offer}.`,
        `IMAGE: The owner or lead practitioner, facing camera, workspace visible. TEXT OVERLAY: "The ${online ? "online" : city} spot for ${term}." FOOTER: ${a.offer} · ${voice.ctaLine}`,
      ],
      landing_copy: `# ${a.hook}\n\n${cap(term)} is ${deltaPhrase(signal)} in ${online ? "online" : city} — and most places haven't noticed yet. ${business.name} has.\n\nNot a sales pitch. A straight answer: what ${term} is, whether it's right for you, and what it costs here — ${a.offer}.\n\n**Why ${business.name}**\n— We already do this, every week, for people in ${online ? "online" : city}.\n— One clear price. No follow-up chase.\n— ${voice.ctaLine}\n\n[${voice.bookVerb} now — ${a.offer}]`,
    },
  };

  // The generator must obey the same contract as the model path.
  return GenerationSchema.parse(result);
}
