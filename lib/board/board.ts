import type { Business, Competitor, CompetitorRead, OwnAdRead } from "@/lib/db/types";
import { findGap, summarizeAdvertiser, type AdvertiserSummary, type ReadAd } from "@/lib/read/gap";
import { OPENING_LABEL, OPENING_PHRASE } from "@/lib/read/labels";
import { adsFromRead } from "@/lib/read/market";
import { classifyAdCopy, type AdTheme, type AdvertiserAd } from "@/lib/signals/adlibrary-apify";

/**
 * The board: every tracked competitor's paid ads against the brand's own,
 * from the daily Ad Library reads (lib/intel/social-ingest.ts). Three
 * things come out of it:
 *
 * - the wall: each competitor's live ads right now;
 * - the feed: what changed between one day's read and the next (launched,
 *   stopped, crossed 30/60/90 days);
 * - what you're missing: the openings, angles, volume, pace and placements
 *   the competitors run that the brand doesn't, ranked by how many of them
 *   agree.
 *
 * Pure: the page loads the reads and hands them over. Every claim is a
 * count of public ads; the Ad Library never says what an ad spent or sold,
 * and the page says so.
 */

/** The reader stores at most this many ads per read; a longer account can't prove an ad stopped. */
export const SAMPLE_CAP = 40;
const NEW_DAYS = 7;
const MILESTONES = [30, 60, 90];

export interface BoardSide {
  summary: AdvertiserSummary;
  ads: AdvertiserAd[];
  platforms: string[];
  launchedThisWeek: number;
  readAt: string;
}

export interface BoardRival extends Partial<BoardSide> {
  id: string;
  name: string;
  website: string | null;
}

export type MissingKind = "opening" | "angle" | "volume" | "pace" | "placement";

export interface Missing {
  id: string;
  kind: MissingKind;
  /** A short label: "Problem-first openings", "An offer". */
  label: string;
  headline: string;
  detail: string;
  example: { advertiser: string; text: string; runningDays: number | null } | null;
  rivalsUsing: number;
  rivalsRead: number;
  score: number;
}

export interface Change {
  day: string;
  advertiser: string;
  you: boolean;
  kind: "launched" | "stopped" | "milestone";
  count: number;
  text: string;
  days: number | null;
}

export interface Board {
  you: BoardSide | null;
  rivals: BoardRival[];
  missing: Missing[];
  changes: Change[];
  lastReadAt: string | null;
  /** Days of history the feed was built from. */
  historyDays: number;
}

/** Each angle as a sentence ends: [one rival, several rivals]. */
const THEME: Partial<Record<AdTheme, { label: string; says: [string, string]; detail: string; weight: number }>> = {
  offer: { label: "An offer", says: ["has an offer running", "have an offer running"], detail: "A discount, a bundle or free shipping in the copy.", weight: 0.95 },
  social_proof: { label: "Social proof", says: ["leans on social proof", "lean on social proof"], detail: "Ratings, reviews, customer counts, awards.", weight: 0.85 },
  education: { label: "Teaching ads", says: ["runs teaching ads", "run teaching ads"], detail: "How-to, myths, the why behind the product.", weight: 0.8 },
  scarcity: { label: "Urgency", says: ["runs urgency", "run urgency"], detail: "Limited runs, ends-soon, last chance.", weight: 0.7 },
  novelty: { label: "Launch ads", says: ["announces something new", "announce something new"], detail: "New products, drops, introductions.", weight: 0.6 },
};

const PLACEMENT: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

/** What makes copy an offer, said out loud. The shared classifier calls any
 * plain sentence an offer by default, which is right for sorting a feed and
 * wrong for saying a brand has no offer running. */
const OFFER_SAID = /(\$\s?\d|\d\s?%|\bpercent\b|\bfree (shipping|gift|trial|returns)\b|\bdeals?\b|\bsale\b|\bdiscounts?\b|\bsave\b|\bcoupons?\b|\bcode\b|\bbogo\b|\b\d+\s?off\b|\bhalf off\b|\bbundle\b)/i;

/** The angle the copy states, or null when it states none. */
export function angleOf(text: string): AdTheme | null {
  if (!text.trim()) return null;
  const theme = classifyAdCopy(text);
  return theme === "offer" && !OFFER_SAID.test(text) ? null : theme;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const textOf = (a: Pick<AdvertiserAd, "headline" | "snippet">) => [a.headline, a.snippet].filter(Boolean).join(" ");

function side(name: string, website: string | null, latest: { raw: unknown; captured_at: string } | undefined, now: Date): BoardSide | undefined {
  if (!latest) return undefined;
  const ads = adsFromRead(latest, now);
  const summary = summarizeAdvertiser(name, website, ads);
  return {
    summary,
    ads,
    platforms: [...new Set(ads.flatMap((a) => a.platforms))].sort(),
    launchedThisWeek: ads.filter((a) => a.runningDays !== null && a.runningDays < NEW_DAYS).length,
    readAt: latest.captured_at,
  };
}

function rivalsWith(rivals: BoardRival[], pick: (r: BoardSide) => AdvertiserAd[]) {
  return rivals.filter((r) => r.ads).map((r) => ({ name: r.name, ads: pick(r as BoardSide) })).filter((r) => r.ads.length > 0);
}

function exampleOf(found: { name: string; ads: AdvertiserAd[] }[]): Missing["example"] {
  const best = found
    .flatMap((r) => r.ads.filter((a) => textOf(a)).map((a) => ({ name: r.name, a })))
    .sort((x, y) => (y.a.runningDays ?? -1) - (x.a.runningDays ?? -1))[0];
  return best ? { advertiser: best.name, text: textOf(best.a).slice(0, 220), runningDays: best.a.runningDays } : null;
}

/** Pure: what the competitors run that the brand doesn't, strongest first. */
export function findMissing(you: BoardSide | null, rivals: BoardRival[]): Missing[] {
  const read = rivals.filter((r) => r.summary && r.summary.active > 0) as (BoardRival & BoardSide)[];
  const n = read.length;
  if (n === 0) return [];
  const majority = Math.max(2, Math.ceil(n / 2));
  const who = (k: number) => (k === n && n > 1 ? `All ${n} of your competitors` : `${k} of your ${plural(n, "competitor")}`);
  const verb = (k: number, [one, many]: [string, string]) => (k === 1 && !(k === n && n > 1) ? one : many);
  const out: Missing[] = [];

  // 1. How the long runners open.
  const gap = findGap(you?.summary ?? null, read.map((r) => r.summary));
  if (gap.opening && gap.kind !== "none") {
    out.push({
      id: `opening:${gap.opening}`,
      kind: "opening",
      label: `${OPENING_LABEL[gap.opening]} openings`,
      // The free read says "rivals"; the board says "competitors" throughout.
      headline: gap.headline.replace(/\brivals\b/g, "competitors").replace(/\brival\b/g, "competitor"),
      detail: `Their ads that ${OPENING_PHRASE[gap.opening]} are the ones they keep paying for.`,
      example: gap.example ? { advertiser: gap.example.advertiser, text: gap.example.text, runningDays: gap.example.runningDays } : null,
      rivalsUsing: gap.rivalsUsing,
      rivalsRead: n,
      score: (gap.rivalsUsing / n) * (gap.kind === "underweight" ? 0.8 : 1),
    });
  }

  // 2. The angle in the copy: an offer, social proof, teaching…
  const yourThemes = new Set((you?.ads ?? []).map((a) => angleOf(textOf(a))));
  for (const [theme, meta] of Object.entries(THEME) as [AdTheme, NonNullable<(typeof THEME)[AdTheme]>][]) {
    if (yourThemes.has(theme)) continue;
    const found = rivalsWith(read, (r) => r.ads.filter((a) => angleOf(textOf(a)) === theme));
    if (found.length < majority) continue;
    out.push({
      id: `angle:${theme}`,
      kind: "angle",
      label: meta.label,
      headline: `${who(found.length)} ${verb(found.length, meta.says)}. You don't.`,
      detail: meta.detail,
      example: exampleOf(found),
      rivalsUsing: found.length,
      rivalsRead: n,
      score: (found.length / n) * meta.weight,
    });
  }

  // 3. How many ads they keep in rotation.
  const theirActive = median(read.map((r) => r.summary.active));
  const yours = you?.summary.active ?? 0;
  if (theirActive >= 4 && yours < theirActive / 2) {
    out.push({
      id: "volume",
      kind: "volume",
      label: "Ads in rotation",
      headline: `Your competitors keep a median of ${plural(theirActive, "ad")} live. You have ${yours}.`,
      detail: "More ads in rotation is more tests running at once, and more chances one of them is the winner.",
      example: null,
      rivalsUsing: read.filter((r) => r.summary.active >= theirActive).length,
      rivalsRead: n,
      score: 0.75 * Math.min(1, (theirActive - yours) / theirActive),
    });
  }

  // 4. How fast they test.
  const theirPace = median(read.map((r) => r.launchedThisWeek));
  const yourPace = you?.launchedThisWeek ?? 0;
  if (theirPace >= 2 && yourPace < theirPace / 2) {
    out.push({
      id: "pace",
      kind: "pace",
      label: "Testing pace",
      headline: `Your competitors launched a median of ${plural(theirPace, "new ad")} in the last 7 days. You launched ${yourPace}.`,
      detail: "They're finding their next long runner while yours ages.",
      example: null,
      rivalsUsing: read.filter((r) => r.launchedThisWeek >= theirPace).length,
      rivalsRead: n,
      score: 0.8 * Math.min(1, (theirPace - yourPace) / theirPace),
    });
  }

  // 5. Where they show up.
  if (you && you.summary.active > 0) {
    for (const platform of Object.keys(PLACEMENT)) {
      if (you.platforms.includes(platform)) continue;
      const using = read.filter((r) => r.platforms.includes(platform)).length;
      if (using < majority) continue;
      out.push({
        id: `placement:${platform}`,
        kind: "placement",
        label: PLACEMENT[platform],
        headline: `${who(using)} ${verb(using, ["runs", "run"])} ads on ${PLACEMENT[platform]}. Yours don't.`,
        detail: "Same ads, another placement: a setting in Ads Manager, not a new shoot.",
        example: null,
        rivalsUsing: using,
        rivalsRead: n,
        score: (using / n) * 0.65,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

type Snapshot = { raw: unknown; captured_at: string; value?: number | null; active?: number };

/** Pure: what changed between consecutive reads of one advertiser. */
export function diffReads(advertiser: string, you: boolean, reads: Snapshot[], now: Date): Change[] {
  const ordered = [...reads].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const out: Change[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const day = cur.captured_at.slice(0, 10);
    const prevAds = adsFromRead(prev, now);
    const curAds = adsFromRead(cur, now);
    const prevIds = new Set(prevAds.map((a) => a.id));
    const curIds = new Set(curAds.map((a) => a.id));
    const sizeOf = (s: Snapshot, ads: AdvertiserAd[]) => s.active ?? s.value ?? ads.length;

    // New ads: in today's read, not yesterday's, and started since then
    // (an old ad that only surfaced because another stopped is not news).
    const since = Date.parse(prev.captured_at) - 2 * 86400_000;
    const launched = curAds.filter((a) => !prevIds.has(a.id) && a.startedOn && Date.parse(`${a.startedOn}T23:59:59Z`) >= since);
    if (launched.length > 0) {
      const first = launched.find((a) => textOf(a)) ?? launched[0];
      out.push({ day, advertiser, you, kind: "launched", count: launched.length, text: textOf(first).slice(0, 200), days: null });
    }
    // Stopped: only provable when both reads held the whole account.
    if (sizeOf(prev, prevAds) <= SAMPLE_CAP && sizeOf(cur, curAds) <= SAMPLE_CAP) {
      for (const a of prevAds.filter((p) => !curIds.has(p.id))) {
        const ran = a.startedOn ? Math.max(0, Math.floor((Date.parse(prev.captured_at) - Date.parse(`${a.startedOn}T00:00:00Z`)) / 86400_000)) : null;
        out.push({ day, advertiser, you, kind: "stopped", count: 1, text: textOf(a).slice(0, 200), days: ran });
      }
    }
    // Milestones: a still-running ad that crossed 30, 60 or 90 days since the last read.
    const prevStart = new Date(prev.captured_at);
    const curStart = new Date(cur.captured_at);
    for (const a of curAds.filter((c) => prevIds.has(c.id) && c.startedOn)) {
      const start = Date.parse(`${a.startedOn}T00:00:00Z`);
      const before = Math.floor((prevStart.getTime() - start) / 86400_000);
      const after = Math.floor((curStart.getTime() - start) / 86400_000);
      const crossed = MILESTONES.filter((m) => before < m && after >= m).pop();
      if (crossed) out.push({ day, advertiser, you, kind: "milestone", count: 1, text: textOf(a).slice(0, 200), days: crossed });
    }
  }
  return out;
}

export interface BoardInput {
  business: Pick<Business, "name" | "website">;
  competitors: Pick<Competitor, "id" | "name" | "website" | "directness">[];
  competitorReads: CompetitorRead[];
  ownReads: OwnAdRead[];
  now?: Date;
}

const CHANGE_ORDER: Record<Change["kind"], number> = { stopped: 0, launched: 1, milestone: 2 };

/** Pure: the whole board from the stored reads. */
export function buildBoard(input: BoardInput): Board {
  const now = input.now ?? new Date();
  const adReads = input.competitorReads.filter((r) => r.kind === "ads");
  const byRival = new Map<string, CompetitorRead[]>();
  for (const r of adReads) byRival.set(r.competitor_id, [...(byRival.get(r.competitor_id) ?? []), r]);
  const latestOf = <T extends { captured_at: string }>(rs: T[] | undefined) => (rs ?? []).slice().sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];

  const ownLatest = latestOf(input.ownReads);
  const you = side(input.business.name, input.business.website, ownLatest, now) ?? null;

  const rivals: BoardRival[] = [...input.competitors]
    .sort((a, b) => (b.directness ?? 0) - (a.directness ?? 0))
    .map((c) => ({ id: c.id, name: c.name, website: c.website, ...side(c.name, c.website, latestOf(byRival.get(c.id)), now) }));

  const changes = [
    ...input.competitors.flatMap((c) => diffReads(c.name, false, byRival.get(c.id) ?? [], now)),
    ...diffReads(input.business.name, true, input.ownReads, now),
  ].sort((a, b) => b.day.localeCompare(a.day) || CHANGE_ORDER[a.kind] - CHANGE_ORDER[b.kind] || a.advertiser.localeCompare(b.advertiser));

  const stamps = [ownLatest?.captured_at, ...rivals.map((r) => r.readAt)].filter((s): s is string => Boolean(s));
  const days = new Set([...adReads, ...input.ownReads].map((r) => r.captured_at.slice(0, 10)));
  return {
    you,
    rivals,
    missing: findMissing(you, rivals),
    changes,
    lastReadAt: stamps.sort().pop() ?? null,
    historyDays: days.size,
  };
}

export type { ReadAd };
