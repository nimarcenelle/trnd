import type { Business, NewIntelNote } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { titleCase } from "@/lib/text";

import type { IntelReport } from "./build";

export const INTEL_NOTE_FALLBACK_MODEL = "trnd-template/v1";
/** intel-3: never tells the owner to wait — thin weeks get a move from the analysis, not a pause. */
export const INTEL_NOTE_PROMPT_VERSION = "intel-3";

/** The same worth-running bar the dashboard uses. */
const THIN_BAR = 4.3;

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

/**
 * Serialize the report into the FACTS block the model writes from — the one
 * source of truth for the note, so every claim is traceable to the page the
 * note sits on.
 */
export function reportFacts(report: IntelReport): string {
  const lines: string[] = [];
  lines.push(
    `Signals watched (7d): ${report.signalsWatched} across ${report.sourceCounts.map((s) => `${s.source} (${s.count})`).join(", ") || "no sources yet"}.`,
  );
  for (const r of report.ranked.slice(0, 5)) {
    lines.push(
      `Ranked #${r.rank}: "${titleCase(r.term)}" — grade ${r.grade.letter} (${r.score}/10), ${r.metric.replace(/_/g, " ")}${typeof r.deltaPct === "number" ? ` up ${Math.round(r.deltaPct)}% this week` : ""}${r.matchedServiceName ? `, matches your ${r.matchedServiceName}` : ", no menu match"}${r.snapshotReason ? `. Judge: ${r.snapshotReason}` : ""}${r.competitorGap ? ` Saturation: ${r.competitorGap}.` : ""}${r.hasCampaign ? " (campaign already built)" : ""}`,
    );
  }
  if (report.ranked.length === 0) {
    lines.push(`Ranked: no trend cleared the bar for paid spend this week — the move comes from the rest of these facts.`);
  }
  for (const d of report.demand) {
    const reads: string[] = [];
    if (d.interestSparse) {
      reads.push("a niche search — steady trickle, too small for Google's meter to chart");
    } else {
      if (typeof d.deltaPct === "number") reads.push(`interest ${d.deltaPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(d.deltaPct))}% this week`);
      if (d.interestLevel !== null) {
        reads.push(
          `search interest now ${d.interestLevel}/100${d.interestRange ? ` (90-day range ${d.interestRange.min}–${d.interestRange.max})` : ""}${d.interestMeasuredAs ? `, measured as "${d.interestMeasuredAs}"` : ""}`,
        );
      }
    }
    if (typeof d.coverageCount === "number") reads.push(`${d.coverageCount} local news mention${d.coverageCount === 1 ? "" : "s"}`);
    if (typeof d.adCount === "number") reads.push(`${d.adCount} competing Meta ad${d.adCount === 1 ? "" : "s"}`);
    lines.push(`Demand term "${d.term}": ${reads.length ? reads.join(", ") : "no reads captured yet"}${d.lastRead ? ` (as of ${d.lastRead})` : ""}.`);
  }
  for (const c of report.competitors.slice(0, 3)) {
    lines.push(
      `Competitor ads on "${c.term}": ${c.adCount} active${c.ads.length ? ` — e.g. ${c.ads.map((a) => a.advertiser).join(", ")}` : ""} (${c.capturedAt}).`,
    );
  }
  for (const w of report.competitorsWatched) {
    const bits: string[] = [];
    if (w.ads) {
      const delta =
        w.previousAdCount !== null && (w.ads.count ?? 0) <= 300 && w.previousAdCount <= 300
          ? ` (was ${w.previousAdCount} a week ago)`
          : "";
      bits.push(`${w.ads.summary}${delta}`);
    }
    if (w.reviews) bits.push(`${w.reviews.rating ?? "—"}★ across ${w.reviews.count ?? 0} Google reviews`);
    lines.push(`Watched competitor ${w.name}: ${bits.length ? bits.join("; ") : "no reads captured yet"}.`);
  }
  if (report.voice && report.voice.review_count > 0) {
    lines.push(
      `Customer voice (${report.voice.review_count} own reviews): praised — ${report.voice.themes.join("; ") || "n/a"}. Their words — ${report.voice.copy_hooks.join("; ") || "n/a"}.${report.voice.watchouts.length ? ` Complaints — ${report.voice.watchouts.join("; ")}.` : ""}`,
    );
  }
  for (const m of report.seasonal) {
    lines.push(`Seasonal: ${m.label} in ${m.daysOut} days${m.prepNow ? " — prep window is open now" : ` (start prep ~${m.leadWeeks} weeks out)`}. ${m.advice}`);
  }
  const res = report.results;
  lines.push(
    res.avgCtr !== null
      ? `Results to date: ${res.launched} launched, avg CTR ${pct(res.avgCtr)} vs ~${pct(res.benchmark)} category typical${res.roas !== null ? `, ${res.roas.toFixed(1)}x return` : ""}.`
      : `Results to date: ${res.totalCampaigns} campaign${res.totalCampaigns === 1 ? "" : "s"} generated, no recorded results yet.`,
  );
  if (report.brief?.positioning) lines.push(`Positioning: ${report.brief.positioning}`);
  if (report.brief?.customer_segments?.length) lines.push(`Who buys: ${report.brief.customer_segments.join(" | ")}`);
  if (report.brief?.advantages?.length) lines.push(`Edges: ${report.brief.advantages.join(" | ")}`);
  if (report.brief?.first_moves?.length) lines.push(`Standing moves from the analysis: ${report.brief.first_moves.join(" | ")}`);
  if (report.brief?.seasonality) lines.push(`Seasonality read: ${report.brief.seasonality}`);
  return lines.join("\n");
}

/** Deterministic analyst note — same shape as the model's, built only from
 * the report. Used when Gemini is absent or fails, and replaced by the real
 * note on a later load once the key works. */
export function buildFallbackIntelNote(business: Business, report: IntelReport): NewIntelNote {
  const top = report.ranked[0] ?? null;
  const thin = !top || top.score < THIN_BAR;

  const headline = top
    ? thin
      ? `Hold your spend this week — nothing in the pool squarely fits what you sell.`
      : `Run "${titleCase(top.term)}" this week — ${top.grade.label.toLowerCase()} at grade ${top.grade.letter}.`
    : report.brief?.first_moves?.[0]
      ? report.brief.first_moves[0]
      : `Lead with your strongest offer this week — no trend beat it, so your own menu is the play.`;

  const narrative: string[] = [];
  if (top) {
    narrative.push(
      thin
        ? `TRND took ${report.signalsWatched} market reads across ${report.sourceCounts.length} source${report.sourceCounts.length === 1 ? "" : "s"} this week and none of them fit what ${business.name} actually sells — the honest move is to wait rather than force a campaign. The closest fit, "${titleCase(top.term)}", graded ${top.grade.letter}.`
        : `Out of ${report.signalsWatched} market reads this week, "${titleCase(top.term)}" is the one worth your budget: grade ${top.grade.letter}${top.matchedServiceName ? `, matching your ${top.matchedServiceName}` : ""}${top.competitorGap ? ` — ${top.competitorGap.toLowerCase()}` : ""}.`,
    );
  } else {
    narrative.push(
      report.brief?.positioning
        ? `No trend in ${business.city} beat what you already sell this week, so the play is your own positioning: ${report.brief.positioning}`
        : `No trend in ${business.city} beat what you already sell this week, so the play is your own menu — one specific offer, priced, aimed at the ${business.radius_miles}-mile radius.`,
    );
    if (report.brief?.moat) narrative.push(report.brief.moat);
  }
  const lowSat = report.demand.filter((d) => typeof d.adCount === "number" && d.adCount <= 5);
  const withReads = report.demand.filter((d) => d.lastRead !== null);
  if (withReads.length > 0) {
    narrative.push(
      `Your ${report.demand.length} tracked demand terms are read daily${lowSat.length > 0 ? `; ${lowSat.map((d) => `"${d.term}"`).slice(0, 2).join(" and ")} show${lowSat.length === 1 ? "s" : ""} little competing ad coverage right now — open ground when you want it` : ""}.`,
    );
  }
  const nextMoment = report.seasonal[0];
  if (nextMoment) {
    narrative.push(
      `On the calendar: ${nextMoment.label} is ${nextMoment.daysOut} days out${nextMoment.prepNow ? " and the prep window is already open" : ""}. ${nextMoment.advice}`,
    );
  }

  const actions: string[] = [];
  if (top && !thin) {
    actions.push(
      top.hasCampaign
        ? `Review and launch the "${titleCase(top.term)}" campaign — it's already built.`
        : `Build the "${titleCase(top.term)}" campaign — it takes under a minute.`,
    );
  }
  if ((thin || !top) && report.brief?.first_moves?.length) {
    actions.push(...report.brief.first_moves.slice(0, top ? 1 : 2));
  }
  if (nextMoment?.prepNow) actions.push(`Start creative for ${nextMoment.label} now — inside the ${nextMoment.leadWeeks}-week prep window.`);
  if (report.results.avgCtr === null && report.results.totalCampaigns > 0) {
    actions.push(`Record results for your ${report.results.totalCampaigns === 1 ? "campaign" : "campaigns"} — every number sharpens next week's ranking.`);
  }
  if (actions.length < 2) actions.push(`Read the competitor and customer-voice sections below — the ad angle is usually sitting in one of them.`);

  return {
    business_id: business.id,
    week_of: report.week,
    headline,
    narrative: narrative.slice(0, 3),
    actions: actions.slice(0, 4),
    model_used: INTEL_NOTE_FALLBACK_MODEL,
    prompt_version: noteFingerprint(report),
  };
}

/**
 * What the note was written from, coarsely: the ranked terms plus whether any
 * demand read exists. A stored note whose fingerprint no longer matches was
 * written before the analysis landed and is regenerated, not shown.
 */
export function noteFingerprint(report: IntelReport): string {
  const key = [
    report.ranked.map((r) => r.term).join(","),
    report.demand.some((d) => d.lastRead !== null) ? "reads" : "noreads",
    report.competitorsWatched.some((w) => w.ads || w.reviews) ? "rivals" : "norivals",
  ].join("|");
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `${INTEL_NOTE_PROMPT_VERSION}/${(h >>> 0).toString(36)}`;
}

export async function generateIntelNote(
  business: Business,
  report: IntelReport,
): Promise<NewIntelNote> {
  if (isGeminiConfigured) {
    try {
      const { generateIntelNoteWithGemini } = await import("@/lib/ai/gemini");
      const { value, model } = await generateIntelNoteWithGemini(business, reportFacts(report));
      return {
        business_id: business.id,
        week_of: report.week,
        ...value,
        model_used: model,
        prompt_version: noteFingerprint(report),
      };
    } catch (err) {
      console.warn("[report] Gemini intel note failed — using deterministic fallback:", (err as Error).message);
    }
  }
  return buildFallbackIntelNote(business, report);
}
