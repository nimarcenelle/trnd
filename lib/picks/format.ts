import type { BrandPick, PickDetail, PickScript } from "@/lib/db/types";

/**
 * How a pick's numbers are said, in one place. The metric appears exactly
 * once per page and has to match the list row character for character, so
 * the list, the detail page, "Copy all" and the export all format it here.
 */

export type MetricDirection = "up" | "down" | "flat";

export interface FormattedMetric {
  label: string;
  /** "+49%", "-12%", or "" when there is no delta. */
  delta: string;
  direction: MetricDirection;
  /** "week over week" | "over 30 days" */
  window: string;
  /** "+49% week over week" — the whole metric as one phrase. */
  text: string;
}

export function formatMetric(
  pick: Pick<BrandPick, "metric_label" | "metric_delta_pct" | "metric_window">,
): FormattedMetric {
  const pct = typeof pick.metric_delta_pct === "number" && Number.isFinite(pick.metric_delta_pct)
    ? Math.round(pick.metric_delta_pct)
    : null;
  const window = pick.metric_window === "week" ? "week over week" : "over 30 days";
  const delta = pct === null ? "" : `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${Math.abs(pct)}%`;
  const direction: MetricDirection = pct === null || pct === 0 ? "flat" : pct > 0 ? "up" : "down";
  return { label: pick.metric_label, delta, direction, window, text: delta ? `${delta} ${window}` : window };
}

/** "$1.5K", "$800", "$12K". */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0";
  if (amount >= 1000) {
    const k = amount / 1000;
    return `$${(k >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toString()}K`;
  }
  return `$${Math.round(amount)}`;
}

/** "$1.5K / 5 days" */
export function formatBet(pick: Pick<BrandPick, "bet_budget_usd" | "bet_duration_days">): string {
  const days = pick.bet_duration_days;
  return `${formatUsd(Number(pick.bet_budget_usd))} / ${days} day${days === 1 ? "" : "s"}`;
}

/** One script as plain text, for its copy button. */
export function scriptToText(
  script: Pick<PickScript, "variant_label" | "thesis" | "hook" | "beats" | "cta" | "duration_seconds"> & { direction?: PickScript["direction"] },
): string {
  const body = script.direction
    ? [`Show: ${script.direction.show}`, `Say: ${script.direction.say}`, `Prove: ${script.direction.prove}`].join("\n")
    : script.beats
    .map((b, i) =>
      [
        `${i + 1}. Visual: ${b.visual}`,
        b.on_screen_text ? `   On screen: ${b.on_screen_text}` : "",
        b.vo ? `   Voiceover: ${b.vo}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return [
    `${script.variant_label}: ${script.thesis}`,
    `Hook: ${script.hook}`,
    "",
    body,
    "",
    `Close: ${script.cta}`,
    `Length: about ${script.duration_seconds}s`,
  ].join("\n");
}

/** The whole pick as plain text: "Copy all" and the export. The metric once. */
export function pickToText(detail: Pick<PickDetail, "pick" | "scripts">): string {
  const { pick, scripts } = detail;
  const metric = formatMetric(pick);
  return [
    pick.finding,
    `${metric.label}: ${metric.text}`,
    "",
    "THE BET",
    `What to run: ${pick.bet_what}`,
    `Budget: ${formatUsd(Number(pick.bet_budget_usd))}`,
    `Duration: ${pick.bet_duration_days} day${pick.bet_duration_days === 1 ? "" : "s"}`,
    `Kill rule: ${pick.bet_kill_rule}`,
    ...(pick.guardrail ? ["", `GUARDRAIL: ${pick.guardrail}`] : []),
    "",
    ...scripts.flatMap((s, i) => [`SCRIPT ${i + 1}`, scriptToText(s), ""]),
  ]
    .join("\n")
    .trimEnd();
}
