import type { ProspectLead } from "./types";

/**
 * Fit score — how likely this lead is to read a founder email and want what
 * TRND does. Pure, deterministic, computed from what the pipeline already
 * collected, so the client and server always agree. Every point comes with
 * a reason the operator can read in the table.
 *
 * The heuristics encode one idea: we want an OWNER who reads their own inbox,
 * runs an established-but-still-small business, and has shown some appetite
 * for growth. Chains, brand-new shops, and listing-only businesses score low.
 */

export type FitTier = "hot" | "warm" | "cold";

export interface Fit {
  /** 0–100. */
  score: number;
  tier: FitTier;
  /** Short reasons, strongest first — shown in the table. */
  reasons: string[];
}

export const HOT_MIN = 65;
export const WARM_MIN = 40;

const DIY_PLATFORMS = new Set(["Wix", "Squarespace", "GoDaddy", "Weebly"]);
const FREEMAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|msn|proton|protonmail|ymail)\.com$/i;
const GENERIC_INBOX = /^(hello|hi|info|contact|hola|howdy|bookings?|orders?|team|shop|office|sales|admin|support|events?|catering|inquiries|enquiries)$/i;

// Well-known multi-location brands whose "contact" goes to corporate. Word
// boundaries so "Subway Sandwiches" hits and "Subwayside Café" doesn't.
export const CHAIN_NAMES =
  /\b(starbucks|dunkin'?|peet'?s|dutch bros|subway|mcdonald'?s|burger king|wendy'?s|taco bell|chipotle|panera|domino'?s|pizza hut|papa john'?s|little caesars|kfc|popeyes|chick-fil-a|sonic|jack in the box|carl'?s jr|del taco|in-n-out|five guys|jersey mike'?s|jimmy john'?s|firehouse subs|denny'?s|ihop|applebee'?s|chili'?s|olive garden|outback|red robin|buffalo wild wings|wingstop|dairy queen|baskin.?robbins|cold stone|jamba|smoothie king|tropical smoothie|planet fitness|anytime fitness|24 hour fitness|la fitness|crunch fitness|orangetheory|f45|snap fitness|gold'?s gym|equinox|ymca|curves|pure barre|club pilates|yogaworks|corepower|supercuts|great clips|sport clips|fantastic sams|european wax|massage envy|hand and stone|7-eleven|circle k|walmart|target|costco|safeway|vons|albertsons|kroger|ralphs|stater bros|walgreens|cvs|rite aid|home depot|lowe'?s|autozone|o'?reilly|jiffy lube|valvoline|midas|firestone|pep boys|les schwab|discount tire|big o tires)\b/i;

export function isChainName(name: string): boolean {
  return CHAIN_NAMES.test(name);
}

/** "www.frontiercafe29.com" → "frontiercafe29.com". Good enough for grouping. */
export function rootDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return null;
  }
}

// Site builders and marketplaces where many businesses share one domain —
// a shared domain here is not evidence of a chain.
const SHARED_HOSTS = /^(facebook|instagram|business\.site|godaddysites|wixsite|square\.site|squarespace|weebly|linktr\.ee|yelp|toasttab|clover|doordash|grubhub)\./i;

export function isSharedHost(domain: string): boolean {
  return SHARED_HOSTS.test(domain + ".");
}

export function scoreFit(lead: Pick<
  ProspectLead,
  "name" | "website" | "platform" | "bestEmail" | "emailStatus" | "adPixels" | "rating" | "reviewCount"
>): Fit {
  const reasons: { pts: number; text: string }[] = [];
  const add = (pts: number, text: string) => reasons.push({ pts, text });

  // Reachability is the gate: no deliverable email means no outreach at all.
  if (!lead.bestEmail || lead.emailStatus === "none") {
    return { score: 0, tier: "cold", reasons: [lead.website ? "No reachable email" : "No website — listings only"] };
  }

  add(lead.emailStatus === "verified" ? 20 : 8, lead.emailStatus === "verified" ? "Email domain accepts mail" : "Email domain unverified — bounce risk");

  // Who reads the inbox.
  const [local, domain] = lead.bestEmail.toLowerCase().split("@");
  const site = rootDomain(lead.website);
  if (FREEMAIL.test(domain)) add(10, "Gmail-style inbox — the owner reads it");
  else if (site && domain.endsWith(site) && !GENERIC_INBOX.test(local)) add(10, "Named inbox on their own domain");
  else if (site && domain.endsWith(site)) add(5, "Generic inbox on their own domain");
  else add(2, "Off-domain inbox");

  // How the site was built says who runs the business day to day.
  if (DIY_PLATFORMS.has(lead.platform)) add(12, `${lead.platform} site — owner-built, owner-run`);
  else if (lead.platform === "Shopify" || lead.platform === "Toast") add(8, `${lead.platform} — already pays for growth tools`);
  else if (lead.platform === "WordPress") add(5, "WordPress site");
  else if (lead.platform === "Custom") add(3, "Custom site — may route through a web contractor");

  // Established but still small: enough reviews to have a budget, not so
  // many that a manager layer answers the email.
  const n = lead.reviewCount;
  if (n === null) add(0, "Review count unknown");
  else if (n >= 15 && n <= 300) add(15, `${n} reviews — established, still owner-run`);
  else if (n > 300 && n <= 1000) add(6, `${n} reviews — busy, likely a manager in between`);
  else if (n > 1000) add(0, `${n} reviews — high volume, corporate feel`);
  else if (n >= 5) add(6, `${n} reviews — young business`);
  else add(0, `${n} reviews — brand new`);

  const r = lead.rating;
  if (r !== null) {
    if (r >= 3.6 && r < 4.8) add(8, `${r.toFixed(1)}★ — solid, with room to grow`);
    else if (r >= 4.8 && (n ?? 0) >= 15) add(5, `${r.toFixed(1)}★ — beloved locally`);
    else if (r < 3.5) add(-6, `${r.toFixed(1)}★ — struggling; may not spend`);
  }

  // Ad appetite. Both segments are real prospects; they get different pitches.
  if (lead.adPixels.length > 0) add(12, "Runs ads already — proven willingness to pay");
  else if (lead.website) add(8, "No ad pixel — greenfield, needs to be sold on ads");

  if (isChainName(lead.name)) add(-40, "Chain brand — email goes to corporate");

  const score = Math.max(0, Math.min(100, reasons.reduce((s, x) => s + x.pts, 0)));
  const tier: FitTier = score >= HOT_MIN ? "hot" : score >= WARM_MIN ? "warm" : "cold";
  return {
    score,
    tier,
    reasons: reasons
      .filter((x) => x.pts !== 0)
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts))
      .map((x) => x.text),
  };
}
