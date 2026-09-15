/**
 * Competitive signal: active competitors' own ad history. What's working,
 * what's saturated, where whitespace is open.
 *
 * Whitespace 45% (how few rivals run this exact angle), saturation trend 30%
 * (is that count rising or falling), competitor weakness 25% (how many of
 * their ads on it look weak).
 *
 * Guardrail: with no competitors connected, or none of their ADS read, nothing
 * is computed. A made-up whitespace score would read as real, and so did a
 * real one measured on the rivals' organic captions: "none of the 5
 * competitors run this angle" was true of their Instagram grid while their
 * ads had never been fetched. "Read" here means ads seen (lib/scoring/gather.ts).
 */

import { SUB_WEIGHTS, signalScore, type CompetitiveInput, type SignalComponent, type SignalScore } from "./model";

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export const NO_COMPETITORS_NOTE = "No competitors connected yet";
export const NOTHING_READ_NOTE = "Competitors added, but their ads haven't been read yet";
export const WORDLESS_ADS_NOTE = "Competitors' ads were seen, but none carry copy that says what they lead with";
/** Posts and ads seen across the rivals before the read is high confidence. */
export const HIGH_EVIDENCE_ITEMS = 12;
/** Reviews mentioning the angle before their complaint rate counts. */
export const MIN_REVIEWS_FOR_WEAKNESS = 3;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function emptyComponents(detail: string): SignalComponent[] {
  const w = SUB_WEIGHTS.competitive;
  return [
    { key: "whitespace", label: "Whitespace", weight: w.whitespace, score: null, detail },
    { key: "saturation", label: "Saturation trend", weight: w.saturation, score: null, detail },
    { key: "weakness", label: "Competitor weakness", weight: w.weakness, score: null, detail },
  ];
}

export function scoreCompetitive(input: CompetitiveInput): SignalScore {
  if (input.competitorsConnected <= 0) {
    return signalScore("competitive", emptyComponents(NO_COMPETITORS_NOTE), "low", {
      note: NO_COMPETITORS_NOTE,
      cta: { label: "Add competitors", href: input.settingsHref },
    });
  }
  if (input.competitorsRead <= 0) {
    const note = (input.rivalsWithWordlessAds ?? 0) > 0 ? WORDLESS_ADS_NOTE : NOTHING_READ_NOTE;
    return signalScore("competitive", emptyComponents(note), "low", { note });
  }

  const w = SUB_WEIGHTS.competitive;
  const read = input.competitorsRead;
  const now = clamp(Math.max(0, input.rivalsOnAngleNow), 0, read);

  const whitespace = round1(clamp(100 * (1 - now / read)));
  const whitespaceDetail =
    now === 0
      ? `None of the ${read} ${plural(read, "competitor", "competitors")} read run this angle`
      : `${now} of ${read} ${plural(read, "competitor", "competitors")} already run this angle`;

  let saturation: number | null = null;
  let saturationDetail = "No read on who ran this angle last month";
  const prior = input.rivalsOnAnglePrior;
  if (prior !== null) {
    const p = Math.max(0, prior);
    if (now < p) {
      saturation = 80;
      saturationDetail = `Fewer competitors on it than last month: ${now} now, down from ${p}`;
    } else if (now === p) {
      saturation = 50;
      saturationDetail = `Same number of competitors on it as last month: ${now}`;
    } else {
      saturation = 20;
      saturationDetail = `More competitors piling in: ${now} now, up from ${p} last month`;
    }
  }

  // Weakness: their ads on this angle that got pulled, and what their own
  // customers say about it in reviews. A rival whose reviews on the angle
  // run one or two stars is a rival the brand can beat on it; a rival
  // whose reviewers praise it is not.
  let weakness: number | null = null;
  let weaknessDetail = "No competitor ads or reviews on this angle to judge";
  const parts: { score: number; detail: string }[] = [];
  if (input.rivalAdsOnAngle > 0) {
    const weak = clamp(Math.max(0, input.weakRivalAds), 0, input.rivalAdsOnAngle);
    parts.push({
      score: round1((weak / input.rivalAdsOnAngle) * 100),
      detail: `${weak} of ${input.rivalAdsOnAngle} competitor ${plural(input.rivalAdsOnAngle, "ad", "ads")} on this angle ${weak === 1 ? "looks" : "look"} weak`,
    });
  }
  const rv = input.reviews;
  if (rv && rv.onTerm >= MIN_REVIEWS_FOR_WEAKNESS) {
    const share = rv.lowOnTerm / rv.onTerm;
    // Half of the reviews mentioning it are complaints: full marks.
    const score = round1(clamp((share / 0.5) * 100));
    let detail = `${rv.lowOnTerm} of ${rv.onTerm} competitor reviews mentioning this ${rv.lowOnTerm === 1 ? "is" : "are"} one or two stars`;
    if (rv.ownOnTerm !== null && rv.ownLowOnTerm !== null && rv.ownOnTerm >= MIN_REVIEWS_FOR_WEAKNESS) {
      const ownShare = rv.ownLowOnTerm / rv.ownOnTerm;
      if (ownShare === 0 && share > 0) detail += `, and none of your ${rv.ownOnTerm} are`;
      else if (ownShare > 0) {
        const times = share / ownShare;
        detail += times >= 1.5 ? `, ${times.toFixed(times >= 3 ? 0 : 1)} times as often as yours` : `, about as often as yours`;
      }
    }
    parts.push({ score, detail });
  }
  if (parts.length > 0) {
    weakness = round1(parts.reduce((s, p) => s + p.score, 0) / parts.length);
    weaknessDetail = parts.map((p) => p.detail).join("; ");
  }

  const components: SignalComponent[] = [
    { key: "whitespace", label: "Whitespace", weight: w.whitespace, score: whitespace, detail: whitespaceDetail },
    { key: "saturation", label: "Saturation trend", weight: w.saturation, score: saturation, detail: saturationDetail },
    { key: "weakness", label: "Competitor weakness", weight: w.weakness, score: weakness, detail: weaknessDetail },
  ];

  // High needs three rivals read, a prior window, and enough of their
  // output seen to say what they run: a rival with one post is a glimpse.
  const evidence = input.evidenceItems ?? HIGH_EVIDENCE_ITEMS;
  const confidence = read >= 3 && prior !== null && evidence >= HIGH_EVIDENCE_ITEMS ? "high" : "medium";
  return signalScore("competitive", components, confidence);
}
