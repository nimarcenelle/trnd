import type { Business, Opportunity, Service, Signal } from "@/lib/db/types";

import type { AngleResult, CampaignAssets } from "./schemas";

/**
 * Numeric-claim guard for generated ad copy. The model writes vivid copy,
 * and vivid copy invents measurements — a "50-degree plunge" whose owner
 * never stated a water temperature, a "45-minute" result nobody promised.
 * Ad platforms reject unverifiable claims and owners lose trust the moment
 * copy states a fact about their business they never gave us.
 *
 * The scanner is deterministic: it extracts every measurement-shaped number
 * from the copy and checks it against the numbers the owner actually
 * provided (service prices, radius, the signal's own delta). What it flags
 * triggers one targeted rewrite call; the model keeps numbers that are
 * plainly about the world ("IV drips take an hour") and strips or softens
 * the ones that pose as facts about this business.
 */

export interface NumericClaim {
  /** The matched fragment, as written ("50-degree", "$95", "45 minutes"). */
  text: string;
  kind: "temperature" | "duration" | "percent" | "money" | "year";
  value: number;
}

const PATTERNS: { kind: NumericClaim["kind"]; re: RegExp }[] = [
  // "50°", "50 °F", "50 degrees", "50-degree"
  { kind: "temperature", re: /(\d+(?:\.\d+)?)\s*(?:°\s*[cf]?|[-\s]degrees?\b)/gi },
  // "45 minutes", "45-minute", "2 hours", "30 sec", "10-day"
  { kind: "duration", re: /(\d+(?:\.\d+)?)[-\s](?:minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?|months?)\b/gi },
  { kind: "percent", re: /(\d+(?:\.\d+)?)\s*(?:%|percent)\b/gi },
  // "$65", "$ 65.50", "65 dollars"
  { kind: "money", re: /\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+dollars\b/gi },
  // Bare years read as history claims ("serving NYC since 2015").
  { kind: "year", re: /\b(?:since|est\.?|established)\s+((?:19|20)\d{2})\b/gi },
];

export function extractNumericClaims(text: string): NumericClaim[] {
  const out: NumericClaim[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const raw = m[1] ?? m[2];
      if (!raw) continue;
      out.push({ text: m[0].trim(), kind, value: Number(raw) });
    }
  }
  return out;
}

/** Numbers pulled from text the OWNER wrote — a "50° plunge" named in a
 * service description makes 50 a legitimate number to advertise. */
function ownerNumbers(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

export interface ClaimFacts {
  /** Every number the copy is allowed to state. */
  allowed: Set<number>;
  /** Human-readable fact lines for the rewrite prompt. */
  lines: string[];
  /** Everything the owner actually told us, lowercased — the only place a
   * service promise (pickup, same-day, free, guaranteed…) may come from. */
  ownerText: string;
}

/**
 * Service-shaped promises. A number guard catches "50-degree"; it does not
 * catch "we pick up your bike" or "our van comes to you" written for a shop
 * whose menu lists only "Delivery $50". Each promise is allowed only when
 * one of its own words appears in the owner's text; otherwise it is an
 * invented service, and the owner would be advertising something they
 * don't do.
 */
export interface ServicePromise {
  /** The matched fragment, as written. */
  text: string;
  /** What kind of promise it is, for the rewrite prompt. */
  label: string;
}

const PROMISES: { label: string; re: RegExp; allowedBy: RegExp }[] = [
  { label: "pickup", re: /\bpick(?:s|ed|ing)?[- ]?ups?\b|\bpick (?:it |your \w+ )?up\b/gi, allowedBy: /pick[- ]?up|collect/ },
  { label: "vehicle / mobile service", re: /\b(?:our|the|a) (?:van|truck|mobile (?:unit|team|mechanic|service))\b|\bwe come to you\b|\bhouse calls?\b|\bon[- ]site\b|\bat your (?:home|office|door(?:step)?|building)\b/gi, allowedBy: /\bvan\b|truck|mobile|house call|on[- ]site|we come to you|at your/ },
  { label: "delivery", re: /\bdeliver(?:y|ies|ed|s)?\b|\bdoor[- ]to[- ]door\b|\bto your (?:\w+ )?door\b|\bdoorstep\b/gi, allowedBy: /deliver|door|courier|shipping/ },
  { label: "same-day / speed", re: /\bsame[- ]day\b|\bwhile you wait\b|\bin under an hour\b|\bwithin the hour\b|\bovernight\b/gi, allowedBy: /same[- ]day|while you wait|within the hour|overnight|express|rush/ },
  { label: "hours", re: /\b24\/7\b|\b24 hours\b|\bopen late\b|\bafter[- ]hours\b|\bopen (?:on )?(?:sundays?|weekends?)\b/gi, allowedBy: /24\/7|24 hours|open late|after[- ]hours|sunday|weekend/ },
  { label: "free", re: /\bfree\b(?! of)|\bno charge\b|\bcomplimentary\b|\bon the house\b/gi, allowedBy: /\bfree\b|no charge|complimentary/ },
  { label: "guarantee / warranty", re: /\bguarantee[ds]?\b|\bwarrant(?:y|ies|ied)\b|\bmoney[- ]back\b|\bor it'?s free\b/gi, allowedBy: /guarantee|warrant|money[- ]back/ },
  { label: "financing", re: /\bfinancing\b|\bpayment plans?\b|\bpay (?:later|over time|in installments)\b|\b0% (?:apr|interest)\b/gi, allowedBy: /financ|payment plan|installment|klarna|affirm|afterpay/ },
  { label: "loaner / rental", re: /\bloaner\b|\bcourtesy (?:bike|car|vehicle)\b/gi, allowedBy: /loaner|courtesy|rental/ },
  { label: "walk-ins", re: /\bwalk[- ]ins? (?:welcome|accepted|ok)\b|\bno appointment (?:needed|necessary)\b/gi, allowedBy: /walk[- ]in|no appointment/ },
  { label: "credentials / awards", re: /\b(?:licensed|certified|insured|award[- ]winning|voted best|#1 rated|top[- ]rated|five[- ]star)\b/gi, allowedBy: /licens|certif|insured|award|voted|rated|five[- ]star|5[- ]star/ },
  { label: "curbside / shipping", re: /\bcurbside\b|\bwe ship\b|\bfree shipping\b|\bships? (?:nationwide|anywhere)\b/gi, allowedBy: /curbside|ship/ },
];

export function findUnsupportedPromises(texts: string[], facts: ClaimFacts): ServicePromise[] {
  const seen = new Set<string>();
  const out: ServicePromise[] = [];
  for (const { label, re, allowedBy } of PROMISES) {
    if (allowedBy.test(facts.ownerText)) continue;
    for (const text of texts) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const key = `${label}:${m[0].toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ text: m[0], label });
      }
    }
  }
  return out;
}

export function buildClaimFacts(ctx: {
  business: Business;
  services: Service[];
  signal: Signal;
  opportunity: Opportunity;
}): ClaimFacts {
  const allowed = new Set<number>();
  const lines: string[] = [];

  const prices: number[] = [];
  for (const s of ctx.services.filter((s) => s.is_active)) {
    if (s.price_cents != null) {
      const dollars = s.price_cents / 100;
      allowed.add(dollars);
      allowed.add(Math.round(dollars));
      prices.push(dollars);
      lines.push(`- ${s.name}: $${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`);
    } else {
      lines.push(`- ${s.name}: no price on file`);
    }
    for (const n of ownerNumbers(`${s.name} ${s.description ?? ""}`)) allowed.add(n);
  }
  // Verifiable arithmetic on real prices is a legitimate claim — "two pairs
  // for $90" when denim is $45, "session plus drop-in for $105". Admit small
  // multiples and pairwise sums; everything else stays flagged.
  for (const p of prices) {
    allowed.add(Math.round(p * 2));
    allowed.add(Math.round(p * 3));
    for (const q of prices) allowed.add(Math.round(p + q));
  }
  allowed.add(ctx.business.radius_miles);
  lines.push(`- service radius: ${ctx.business.radius_miles} miles`);
  if (ctx.signal.delta_pct != null) {
    allowed.add(Math.round(ctx.signal.delta_pct));
    lines.push(`- the demand signal "${ctx.signal.term}" is up ${Math.round(ctx.signal.delta_pct)}% this week`);
  }
  for (const n of ownerNumbers(ctx.business.brand_voice_notes ?? "")) allowed.add(n);
  for (const n of ownerNumbers(ctx.business.name)) allowed.add(n);

  const ownerText = [
    ctx.business.name,
    ctx.business.category,
    ctx.business.brand_voice_notes ?? "",
    ...ctx.services.filter((s) => s.is_active).map((s) => `${s.name} ${s.description ?? ""}`),
  ]
    .join(" \n ")
    .toLowerCase();

  return { allowed, lines, ownerText };
}

/** All generated copy surfaces, flattened for scanning. */
export function campaignTexts(angle: AngleResult, assets: CampaignAssets): string[] {
  return [
    angle.angle,
    angle.hook,
    angle.offer,
    ...assets.headlines,
    ...assets.primary_texts,
    ...assets.scripts,
    ...assets.static_briefs,
    assets.landing_copy,
  ];
}

export function findUnsupportedClaims(texts: string[], facts: ClaimFacts): NumericClaim[] {
  const seen = new Set<string>();
  const out: NumericClaim[] = [];
  for (const text of texts) {
    for (const claim of extractNumericClaims(text)) {
      if (facts.allowed.has(claim.value)) continue;
      const key = `${claim.kind}:${claim.text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(claim);
    }
  }
  return out;
}

export function buildClaimsRewritePrompt(
  business: Business,
  angle: AngleResult,
  assets: CampaignAssets,
  flagged: NumericClaim[],
  facts: ClaimFacts,
  promises: ServicePromise[] = [],
): string {
  return [
    `You are fact-checking finished ad copy for ${business.name} before the owner sees it.`,
    flagged.length > 0
      ? `The copy below states numbers that are NOT among the facts the owner provided. For each flagged number, decide:`
      : "",
    flagged.length > 0
      ? `- If it is a claim about ${business.name} itself — its water temperature, session length or duration, results, history, prices — it is INVENTED: remove it or soften it to a non-numeric phrase ("cold" instead of "50-degree", "a quick session" instead of "45 minutes"). Any duration attached to this business's own service or visit ("a 60-minute session", "in and out in 20 minutes") is a business claim, never a world fact.`
      : "",
    flagged.length > 0
      ? `- Only a number plainly about the wider world or the trend itself, detached from this business ("IV drips take about an hour"), may stay — and when in doubt, strip the number.`
      : "",
    promises.length > 0
      ? `The copy also PROMISES services, logistics, or credentials the owner never listed — flagged below. Each one is an invented service: the owner would be advertising something they don't do. Remove it, or replace it with what the menu actually offers (a shop that lists "Delivery" but not pickup can say "we deliver it back", never "we pick it up"; no van, no house calls, no same-day, no free, no guarantee unless the owner said so). Rewrite the whole line so it still reads naturally — an offer, a hook, or a script beat must never be left dangling.`
      : "",
    `Never introduce new numbers or new promises. Keep every edit minimal — same voice, same structure, same asset counts; copy that is not flagged stays word-for-word identical.`,
    ``,
    `FACTS THE OWNER PROVIDED (the only numbers the copy may claim about the business, and the only services it may promise):`,
    ...facts.lines,
    ``,
    flagged.length > 0 ? `FLAGGED NUMBERS: ${flagged.map((c) => `"${c.text}" (${c.kind})`).join(", ")}` : "",
    promises.length > 0 ? `FLAGGED PROMISES: ${promises.map((c) => `"${c.text}" (${c.label})`).join(", ")}` : "",
    ``,
    `THE COPY (return the same JSON shape with your edits applied):`,
    JSON.stringify({ angle, assets }),
  ]
    .filter((line) => line !== "")
    .join("\n");
}
