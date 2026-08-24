/**
 * Deterministic campaign generator. This is the guaranteed path: it runs with
 * zero network access and produces brand-voiced, business-specific campaign
 * JSON that validates against the same schemas as the Gemini path. When
 * GEMINI_API_KEY is present the model path is preferred and this becomes the
 * schema-violation fallback (see lib/ai/index.ts and BLOCKED.md).
 *
 * Voice rules from the brief: short declaratives, concrete nouns and real
 * numbers, define by negation then land the positive, address one owner, em
 * dashes for the turn, no hype verbs, no exclamation marks.
 */

import type { Business, Opportunity, Service, Signal } from "@/lib/db/types";

import { GenerationSchema, type GenerationResult } from "./schemas";

export const FALLBACK_MODEL_ID = "trnd-template/v1";
export const FALLBACK_PROMPT_VERSION = "fallback-1";

interface Ctx {
  business: Business;
  signal: Signal;
  opportunity: Opportunity;
  service: Service | null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function price(service: Service | null): string {
  if (service?.price_cents) return `$${Math.round(service.price_cents / 100)}`;
  return "$49";
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
  const city = business.city;
  const p = price(service);
  const angleType = pickAngleType(ctx);
  const radius = business.radius_miles;

  const angleByType: Record<AngleType, { angle: string; hook: string; offer: string }> = {
    education: {
      angle: `Most people searching "${term}" don't need more — they need it done right. Position ${business.name} as the place in ${city} that explains before it sells.`,
      hook: `Three things nobody tells you about ${term}.`,
      offer: `${offerName} consult — ${p}, applied to your first visit`,
    },
    offer: {
      angle: `Interest in ${term} is ${deltaPhrase(signal)} and almost nobody in ${city} is advertising it. A clear first-timer offer wins the click.`,
      hook: `${cap(term)} — without the guesswork.`,
      offer: `First ${offerName} — ${p} this week`,
    },
    scarcity: {
      angle: `Demand for ${term} in ${city} outstrips the slots that exist. Say the quiet part: openings are limited, and booking early is the move.`,
      hook: `${city} is booking out ${term}. A few spots are left this week.`,
      offer: `Priority booking for ${offerName} — reserve this week`,
    },
    social_proof: {
      angle: `People trying ${term} want proof it works for people like them. Lead with your regulars, not your menu.`,
      hook: `Why ${city} keeps coming back for ${term}.`,
      offer: `${offerName} — ${p} for first-timers`,
    },
    speed: {
      angle: `Searches for ${term} are ${deltaPhrase(signal)} — these are people who want it handled now. Answer with speed, not a brochure.`,
      hook: `Need ${term}? Booked by tonight.`,
      offer: `Same-week ${offerName} — book in two taps`,
    },
    novelty: {
      angle: `${cap(term)} is new enough that no one in ${city} owns it yet. First mover gets the association.`,
      hook: `${city}, meet ${term}.`,
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
        who: audienceWho[business.category] ?? "locals already showing intent for this",
        age_range: business.category === "Health & beauty" ? "23–45" : "25–54",
        radius_miles: radius,
        interests: [term, business.category.toLowerCase(), `${city} local`],
        why: `They're the people behind the ${deltaPhrase(signal)} signal — warm demand, not cold reach.`,
        angle_type: angleType,
      },
    },
    assets: {
      headlines: [
        a.hook,
        `${cap(term)} in ${city} — done right.`,
        `${a.offer}.`,
        `Not sure about ${term}? Start with a straight answer.`,
        `${business.name}: the ${city} answer to ${term}.`,
      ],
      primary_texts: [
        `${cap(term)} is having a moment — ${deltaPhrase(signal)}. Most places will wait a quarter to react. ${business.name} isn't most places. ${a.offer}. Book in two minutes, no phone tag.`,
        `Not a trend chase. Not a gimmick. ${cap(term)} is what your neighbors in ${city} are actually looking for this week — and ${business.name} already does it well. ${a.offer}.`,
        `You've seen ${term} everywhere. Here's the version worth your money — done by people who do it every day at ${business.name} in ${city}. ${a.offer}.`,
      ],
      scripts: [
        `HOOK (0-3s): "${a.hook}"\nPROBLEM (3-10s): Everyone's talking about ${term} — most of the advice is noise.\nPROOF (10-20s): Show the real thing at ${business.name}: hands, process, result. No stock footage.\nCTA (20-30s): "${a.offer}. Link below — takes two minutes."`,
        `HOOK (0-3s): On-screen text: "${cap(term)} — ${deltaPhrase(signal)}."\nSTORY (3-15s): Owner talks straight to camera: why people are asking for this, what actually matters.\nRESULT (15-25s): One real before/after or reaction.\nCTA (25-30s): "We're in ${city}. ${a.offer}."`,
        `HOOK (0-3s): "${city}: stop scrolling if you've been thinking about ${term}."\nLIST (3-20s): Three quick things to know before you book anywhere — genuinely useful, no pitch.\nTURN (20-27s): "That's how we do it at ${business.name}."\nCTA (27-30s): "${a.offer}."`,
      ],
      static_briefs: [
        `IMAGE: Tight, real photo of ${term} in progress at ${business.name} — no stock. TEXT OVERLAY: "${a.hook}" BOTTOM BAR: ${a.offer} · ${city}. Amber CTA button: "Book now".`,
        `IMAGE: Split frame — "what you've heard" vs "what it actually is". TEXT OVERLAY: "${cap(term)}, minus the noise." FOOTER: ${business.name}, ${city} · ${a.offer}.`,
        `IMAGE: The owner or lead practitioner, facing camera, workspace visible. TEXT OVERLAY: "The ${city} spot for ${term}." FOOTER: ${a.offer} · Book in two minutes.`,
      ],
      landing_copy: `# ${a.hook}\n\n${cap(term)} is ${deltaPhrase(signal)} in ${city} — and most places haven't noticed yet. ${business.name} has.\n\nNot a sales pitch. A straight answer: what ${term} is, whether it's right for you, and what it costs here — ${a.offer}.\n\n**Why ${business.name}**\n— We already do this, every week, for people in ${city}.\n— One clear price. No follow-up chase.\n— Book online in two minutes.\n\n[Book now — ${a.offer}]`,
    },
  };

  // The generator must obey the same contract as the model path.
  return GenerationSchema.parse(result);
}
