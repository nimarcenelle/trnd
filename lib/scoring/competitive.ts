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
/** Posts and ads seen across the rivals before the read is high confidence. */
export const HIGH_EVIDENCE_ITEMS = 12;

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
    return signalScore("competitive", emptyComponents(NOTHING_READ_NOTE), "low", { note: NOTHING_READ_NOTE });
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

  let weakness: number | null = null;
  let weaknessDetail = "No competitor ads on this angle to judge";
  if (input.rivalAdsOnAngle > 0) {
    const weak = clamp(Math.max(0, input.weakRivalAds), 0, input.rivalAdsOnAngle);
    weakness = round1((weak / input.rivalAdsOnAngle) * 100);
    weaknessDetail = `${weak} of ${input.rivalAdsOnAngle} competitor ${plural(input.rivalAdsOnAngle, "ad", "ads")} on this angle ${weak === 1 ? "looks" : "look"} weak`;
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
