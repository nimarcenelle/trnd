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
}

export function buildClaimFacts(ctx: {
  business: Business;
  services: Service[];
  signal: Signal;
  opportunity: Opportunity;
}): ClaimFacts {
  const allowed = new Set<number>();
  const lines: string[] = [];

  for (const s of ctx.services.filter((s) => s.is_active)) {
    if (s.price_cents != null) {
      const dollars = s.price_cents / 100;
      allowed.add(dollars);
      allowed.add(Math.round(dollars));
      lines.push(`- ${s.name}: $${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`);
    } else {
      lines.push(`- ${s.name}: no price on file`);
    }
    for (const n of ownerNumbers(`${s.name} ${s.description ?? ""}`)) allowed.add(n);
  }
  allowed.add(ctx.business.radius_miles);
  lines.push(`- service radius: ${ctx.business.radius_miles} miles`);
  if (ctx.signal.delta_pct != null) {
    allowed.add(Math.round(ctx.signal.delta_pct));
    lines.push(`- the demand signal "${ctx.signal.term}" is up ${Math.round(ctx.signal.delta_pct)}% this week`);
  }
  for (const n of ownerNumbers(ctx.business.brand_voice_notes ?? "")) allowed.add(n);
  for (const n of ownerNumbers(ctx.business.name)) allowed.add(n);

  return { allowed, lines };
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
): string {
  return [
    `You are fact-checking finished ad copy for ${business.name} before the owner sees it.`,
    `The copy below states numbers that are NOT among the facts the owner provided. For each flagged number, decide:`,
    `- If it is a claim about ${business.name} itself (its water temperature, session length, results, history, prices), it is INVENTED — remove it or soften it to a non-numeric phrase ("cold" instead of "50-degree", "a quick session" instead of "45 minutes").`,
    `- If it is plainly about the wider world or the trend, not this business ("IV drips take about an hour"), it may stay.`,
    `Never introduce new numbers. Keep every edit minimal — same voice, same structure, same asset counts; copy that is not flagged stays word-for-word identical.`,
    ``,
    `FACTS THE OWNER PROVIDED (the only numbers the copy may claim about the business):`,
    ...facts.lines,
    ``,
    `FLAGGED NUMBERS: ${flagged.map((c) => `"${c.text}" (${c.kind})`).join(", ")}`,
    ``,
    `THE COPY (return the same JSON shape with your edits applied):`,
    JSON.stringify({ angle, assets }),
  ].join("\n");
}
