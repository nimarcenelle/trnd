import type { AdHistory } from "@/lib/db/types";
import { tokens } from "@/lib/scoring";
import { classifyAdCopy, type AdTheme } from "@/lib/signals/adlibrary-apify";

/**
 * What the owner's own past ads say, read against their own account.
 *
 * Every comparison here is to the owner's account average, never to an
 * industry benchmark. A 1.1% CTR is bad for a restaurant on Meta and fine for
 * a plumber on Display, and no benchmark knows which one this owner is. What
 * holds for any account is "these ads did better than your others", which is
 * also the only claim an owner can check against their own Ads Manager.
 *
 * Pure, so the brand signal and the report can both call it on rows they
 * already loaded.
 */

/** Below this an ad's CTR is a few clicks either way, and ranking it as
 * best or worst would be ranking noise. */
export const MIN_AD_IMPRESSIONS = 500;
/** A theme or term needs this much delivery in total before its CTR is
 * allowed to move a score. */
export const MIN_THEME_IMPRESSIONS = 1000;
const BEST = 3;
const WORST = 2;

export interface ThemeRead {
  theme: AdTheme;
  ads: number;
  ctr: number | null;
  /** Ratio to the account CTR: 1.38 means 38% above. */
  vsAccount: number | null;
}

export interface HistoryRead {
  ads: number;
  /** Impression-weighted: clicks over impressions across the account. */
  accountCtr: number | null;
  accountCpcCents: number | null;
  spendCents: number;
  best: AdHistory[];
  worst: AdHistory[];
  byTheme: ThemeRead[];
  lastRanOn: string | null;
}

export interface HistoryMatch {
  /** 0..1, 0.5 neutral. */
  lift: number;
  ads: number;
  ctr: number | null;
  reason: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function adText(r: AdHistory): string {
  return r.copy ?? r.ad_name ?? r.campaign_name;
}

/** Clicks as reported, or implied by a reported CTR when the export left
 * the click column out. */
function clicksOf(r: AdHistory): number | null {
  if (r.clicks !== null) return r.clicks;
  if (r.ctr !== null && r.impressions) return r.ctr * r.impressions;
  return null;
}

function rowCtr(r: AdHistory): number | null {
  if (r.impressions && r.clicks !== null) return r.clicks / r.impressions;
  return r.ctr;
}

/** Impression-weighted CTR over rows that have both numbers. Averaging row
 * CTRs instead would let a 90-impression test ad count as much as the
 * campaign that actually ran. */
function weightedCtr(rows: AdHistory[]): { ctr: number | null; impressions: number } {
  let impressions = 0;
  let clicks = 0;
  for (const r of rows) {
    const c = clicksOf(r);
    if (!r.impressions || c === null) continue;
    impressions += r.impressions;
    clicks += c;
  }
  return { ctr: impressions > 0 ? clicks / impressions : null, impressions };
}

export function readAdHistory(rows: AdHistory[]): HistoryRead {
  const account = weightedCtr(rows).ctr;

  let spendCents = 0;
  let paidClicks = 0;
  let paidSpend = 0;
  for (const r of rows) {
    spendCents += r.spend_cents ?? 0;
    if (r.spend_cents !== null && r.clicks) {
      paidSpend += r.spend_cents;
      paidClicks += r.clicks;
    }
  }

  const ranked = rows
    .filter((r) => (r.impressions ?? 0) >= MIN_AD_IMPRESSIONS && rowCtr(r) !== null)
    .sort((a, b) => (rowCtr(b) ?? 0) - (rowCtr(a) ?? 0));
  const best = ranked.slice(0, BEST);
  // Never the same ad in both lists: with four eligible ads, "your worst"
  // repeating one of "your best" would read as a bug, not an insight.
  const worst = ranked
    .filter((r) => !best.includes(r))
    .reverse()
    .slice(0, WORST);

  const byTheme = [...groupByTheme(rows).entries()]
    .map(([theme, group]) => {
      const ctr = weightedCtr(group).ctr;
      return { theme, ads: group.length, ctr, vsAccount: ctr !== null && account ? ctr / account : null };
    })
    .sort((a, b) => b.ads - a.ads || a.theme.localeCompare(b.theme));

  let lastRanOn: string | null = null;
  for (const r of rows) {
    const day = r.ended_on ?? r.started_on;
    if (day && (!lastRanOn || day > lastRanOn)) lastRanOn = day;
  }

  return {
    ads: rows.length,
    accountCtr: account,
    accountCpcCents: paidClicks > 0 ? Math.round(paidSpend / paidClicks) : null,
    spendCents,
    best,
    worst,
    byTheme,
    lastRanOn,
  };
}

function groupByTheme(rows: AdHistory[]): Map<AdTheme, AdHistory[]> {
  const groups = new Map<AdTheme, AdHistory[]>();
  for (const r of rows) {
    const theme = classifyAdCopy(adText(r));
    groups.set(theme, [...(groups.get(theme) ?? []), r]);
  }
  return groups;
}

/** "cookies" should find the "cookie" ad. A trailing s is the only
 * inflection worth undoing; real stemming would merge words that differ. */
function stem(t: string): string {
  return t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

function stems(text: string): Set<string> {
  return new Set([...tokens(text)].map(stem));
}

const THEME_WORDS: Record<AdTheme, string> = {
  education: "explaining something",
  offer: "a deal or a price",
  scarcity: "a deadline",
  social_proof: "reviews and reputation",
  speed: "speed and convenience",
  novelty: "something new",
};

/**
 * The shared read behind historyOnTerm and historyByTheme. `subject` is the
 * phrase that finishes "your 2 past ads ...", so the reason reads the same
 * whichever way the rows were picked.
 */
function compare(rows: AdHistory[], matched: AdHistory[], subject: string, none: string): HistoryMatch {
  if (matched.length === 0) return { lift: 0.5, ads: 0, ctr: null, reason: none };

  const account = weightedCtr(rows).ctr;
  const { ctr, impressions } = weightedCtr(matched);
  const lead = matched.length === 1 ? `your past ad ${subject}` : `your ${matched.length} past ads ${subject}`;

  if (ctr === null || !account) {
    return { lift: 0.5, ads: matched.length, ctr, reason: `${lead} had no click numbers in the export to compare` };
  }
  // A handful of impressions can put any ad at double the account CTR. Say
  // what ran, but do not let it move the score.
  if (impressions < MIN_THEME_IMPRESSIONS) {
    return { lift: 0.5, ads: matched.length, ctr, reason: `${lead} ran too few impressions to call` };
  }

  const ratio = ctr / account;
  const pct = Math.round((ratio - 1) * 100);
  const reason =
    Math.abs(pct) < 5
      ? `${lead} ran about even with your account average`
      : `${lead} ran ${Math.abs(pct)}% ${pct > 0 ? "above" : "below"} your account average`;
  return { lift: clamp01(0.5 + (ratio - 1) * 0.5), ads: matched.length, ctr, reason };
}

/** How the owner's past ads on this term did against the rest of their
 * account. Matched on shared words in the copy, ad name or campaign name,
 * because owners name campaigns after what they are selling. */
export function historyOnTerm(rows: AdHistory[], term: string): HistoryMatch {
  const want = stems(term);
  const matched =
    want.size === 0
      ? []
      : rows.filter((r) => {
          const have = stems([r.copy, r.ad_name, r.campaign_name].filter(Boolean).join(" "));
          for (const t of want) if (have.has(t)) return true;
          return false;
        });
  return compare(rows, matched, "on this", "you haven't run ads on this before");
}

export function historyByTheme(rows: AdHistory[], theme: AdTheme): HistoryMatch {
  const matched = rows.filter((r) => classifyAdCopy(adText(r)) === theme);
  return compare(rows, matched, `built on ${THEME_WORDS[theme]}`, `you haven't run ads built on ${THEME_WORDS[theme]} before`);
}

/** The angle that has worked best for this owner, when there is enough of
 * it to trust: two ads, so it is not one lucky creative, and enough
 * impressions that the CTR is not a rounding error. */
export function bestTheme(rows: AdHistory[]): { theme: AdTheme; vsAccount: number; ads: number } | null {
  const account = weightedCtr(rows).ctr;
  if (!account) return null;
  let best: { theme: AdTheme; vsAccount: number; ads: number } | null = null;
  for (const [theme, group] of groupByTheme(rows)) {
    if (group.length < 2) continue;
    const { ctr, impressions } = weightedCtr(group);
    if (ctr === null || impressions < MIN_THEME_IMPRESSIONS) continue;
    const vsAccount = ctr / account;
    if (!best || vsAccount > best.vsAccount) best = { theme, vsAccount, ads: group.length };
  }
  return best;
}
