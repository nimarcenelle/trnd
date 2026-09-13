/**
 * Deterministic intent classifier for the Customer signal. No model: a fixed
 * phrase list over lowercase text, so the same comment always reads the same.
 */

import type { IntentKind } from "./model";

// Checked in this order: complaint, purchase_intent, pain_point, curiosity.
const PHRASES: [IntentKind, string[]][] = [
  ["complaint", ["worst", "hate", "scam", "broke", "refund", "disappointed", "never again"]],
  [
    "purchase_intent",
    ["buy", "best ", "worth it", "price", "discount", "code", "where to get", " vs ", "review", "near me", "recommend"],
  ],
  [
    "pain_point",
    ["why is my", "how to fix", "help", "ruined", "damaged", "dry", "itchy", "breakout", "stop ", "keeps", "problem"],
  ],
  ["curiosity", ["what is", "does ", "is it", "how does", "anyone tried", "?"]],
];

/** How much each kind counts toward intent strength, 0-1. Complaints count as
 * pain; curiosity counts a little; unrelated chatter counts nothing. */
export const INTENT_WEIGHT: Record<IntentKind, number> = {
  purchase_intent: 1,
  pain_point: 1,
  complaint: 1,
  curiosity: 0.25,
  unrelated: 0,
};

export function classifyIntent(text: string): IntentKind {
  // Padded with spaces so phrases with a boundary space (" vs ", "best ",
  // "stop ", "does ") also match at the very start or end of the text.
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
  for (const [kind, phrases] of PHRASES) {
    if (phrases.some((p) => t.includes(p))) return kind;
  }
  return "unrelated";
}

/** Share of activity carrying real buying or pain signals, weighted by kind,
 * 0-100. Null when there is no activity to read. */
export function intentStrength(items: { text: string; kind?: IntentKind }[]): number | null {
  if (items.length === 0) return null;
  const total = items.reduce((s, it) => s + INTENT_WEIGHT[it.kind ?? classifyIntent(it.text)], 0);
  return Math.round((total / items.length) * 1000) / 10;
}
