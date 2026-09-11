import type { CompetitorRead, Competitor, Opportunity, Signal } from "@/lib/db/types";
import { gradeFor } from "@/lib/recommend/grade";

/**
 * "What changed since last week" — the first thing an enterprise report
 * says. New terms in the ranking, terms that fell out, grade moves on the
 * ones that stayed, and named rivals whose ad count moved. Nothing to say
 * in week one; the strip renders only when a previous week exists.
 */

export interface ChangeLine {
  kind: "new" | "dropped" | "up" | "down" | "rival";
  text: string;
}

export { previousWeek } from "./week";

export function rankingChanges(
  thisWeek: { opportunity: Opportunity; signal: Signal | null }[],
  lastWeek: { opportunity: Opportunity; signal: Signal | null }[],
): ChangeLine[] {
  if (lastWeek.length === 0) return [];
  const key = (s: Signal | null) => s?.normalized_term ?? "";
  const prev = new Map(lastWeek.map((r) => [key(r.signal), r]));
  const now = new Map(thisWeek.map((r) => [key(r.signal), r]));
  const out: ChangeLine[] = [];
  for (const [k, r] of now) {
    if (!k || !r.signal) continue;
    const before = prev.get(k);
    if (!before) {
      out.push({ kind: "new", text: `New this week: “${r.signal.term}” (${gradeFor(Number(r.opportunity.score)).letter}).` });
      continue;
    }
    const a = gradeFor(Number(before.opportunity.score)).letter;
    const b = gradeFor(Number(r.opportunity.score)).letter;
    if (a !== b) {
      const up = Number(r.opportunity.score) > Number(before.opportunity.score);
      out.push({ kind: up ? "up" : "down", text: `“${r.signal.term}” moved ${a} → ${b}.` });
    }
  }
  for (const [k, r] of prev) {
    if (!k || !r.signal || now.has(k)) continue;
    out.push({ kind: "dropped", text: `“${r.signal.term}” fell out of the ranking.` });
  }
  return out;
}

/** A rival whose active-ad count moved by 2+ between its latest read and the one a week earlier. */
export function rivalChanges(competitors: Competitor[], reads: CompetitorRead[]): ChangeLine[] {
  const out: ChangeLine[] = [];
  for (const c of competitors) {
    const ads = reads
      .filter((r) => r.competitor_id === c.id && r.kind === "ads" && typeof r.value === "number")
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
    if (ads.length < 2) continue;
    const latest = ads[0];
    const weekAgo = ads.find((r) => Date.parse(latest.captured_at) - Date.parse(r.captured_at) >= 6 * 86400_000) ?? ads[ads.length - 1];
    const delta = (latest.value as number) - (weekAgo.value as number);
    if (Math.abs(delta) < 2) continue;
    out.push({
      kind: "rival",
      text: `${c.name} ${delta > 0 ? "added" : "pulled"} ${Math.abs(delta)} Meta ad${Math.abs(delta) === 1 ? "" : "s"} this week (${weekAgo.value} → ${latest.value}).`,
    });
  }
  return out;
}
