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
  for (const r of report.ranked.slice(0, 5)) {
    if (!r.format) continue;
    const f = r.format;
    const bits: string[] = [];
    if (f.medianDurationSec !== null) bits.push(`the winning videos run about ${Math.round(f.medianDurationSec)}s`);
    if (f.engagementPct !== null) bits.push(`${f.engagementPct}% of views react`);
    if (f.actionPct !== null) bits.push(`${f.actionPct}% share or save it`);
    if (f.repeatChannels.length > 0) bits.push(`${f.repeatChannels[0]} has posted more than once on it`);
    if (f.hashtags.length > 0) bits.push(`tagged ${f.hashtags.slice(0, 3).map((h) => `#${h}`).join(", ")}`);
    if (f.topTitle) bits.push(`the top one is "${f.topTitle}"`);
    if (f.breakoutTitle && f.breakoutTitle !== f.topTitle) bits.push(`the fastest climber is "${f.breakoutTitle}"`);
    if (bits.length > 0) lines.push(`Short-form format on "${titleCase(r.term)}": ${bits.join("; ")}.`);
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
  // What TRND remembers: the lines that let week six read differently from
  // week one ("third week ranked", "you passed on this", "the last ad on it
  // returned…"). Empty in week one, and the note says nothing about it.
  for (const h of report.history.slice(0, 12)) lines.push(`Remembered: ${h}`);
  // What the owner told us — their menu, their sales, their brand — the
  // facts only they had. Cited as theirs.
  for (const d of report.documents) lines.push(d);
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

  // Actions are the part the owner acts on, so every line has to carry
  // something only this week's data could say — the term they're bidding on,
  // the item it maps to on the menu, how many rivals are on it, a sentence a
  // real customer wrote. Chores about the software ("build the campaign",
  // "record your results") read identically every week and get skipped.
  const actions: string[] = [];
  const topDemand = top ? report.demand.find((d) => d.term.toLowerCase() === top.term.toLowerCase()) ?? null : null;
  if (top && !thin) {
    const why =
      typeof top.deltaPct === "number" && top.deltaPct >= 10
        ? ` — searches for it are up ${Math.round(top.deltaPct)}% this week.`
        : top.snapshotReason
          ? ` — ${top.snapshotReason.replace(/\.$/, "").toLowerCase()}.`
          : ` — it's the strongest fit in this week's read.`;
    actions.push(
      top.hasCampaign
        ? `Launch the "${titleCase(top.term)}" campaign that's already written${top.matchedServiceName ? `, pointed at your ${top.matchedServiceName}` : ""}${why}`
        : top.matchedServiceName
          ? `Put this week's ad money behind your ${top.matchedServiceName}, in the words people are typing: "${titleCase(top.term)}"${why}`
          : `Run an ad on "${titleCase(top.term)}" this week${why}`,
    );
  }
  if ((thin || !top) && report.brief?.first_moves?.length) {
    actions.push(...report.brief.first_moves.slice(0, top ? 1 : 2));
  }
  // Open ground: the cheapest week to advertise a term is the week nobody
  // else is on it, and that number changes week to week.
  const open = report.demand.find((d) => typeof d.adCount === "number" && d.adCount <= 5 && d.term !== top?.term);
  if (open) {
    actions.push(
      open.adCount === 0
        ? `Put a search ad on "${open.term}" while nobody in ${business.city} is advertising it.`
        : `Put a search ad on "${open.term}" — only ${open.adCount} rival ad${open.adCount === 1 ? " is" : "s are"} running on it near you.`,
    );
  } else {
    const crowded = report.competitors.find((c) => c.estimate !== null && c.estimate > 5 && c.estimate <= 300);
    if (crowded) {
      actions.push(
        `Don't out-bid the ${crowded.estimate} rival ads on "${crowded.term}" — out-say them: name your price and your neighborhood in the first line.`,
      );
    }
  }
  // Not every move is an ad. A term climbing is also a reason to move the
  // thing it maps to where a walk-in trips over it — the owner runs a shop,
  // not a media desk.
  if (top && !thin && top.matchedServiceName) {
    actions.push(
      `Put your ${top.matchedServiceName} where walk-ins see it first, with the price on it — "${titleCase(top.term)}" is what they're coming in asking for.`,
    );
  }
  // Their customers' own words beat anything a copywriter invents.
  const hook = report.voice?.copy_hooks?.[0];
  if (hook) actions.push(`Open the ad with a line your own reviewers wrote: "${hook.replace(/^["']|["']$/g, "")}".`);
  if (nextMoment?.prepNow) actions.push(`Start creative for ${nextMoment.label} now — inside the ${nextMoment.leadWeeks}-week prep window.`);
  if (report.results.avgCtr !== null) {
    const beating = report.results.avgCtr >= report.results.benchmark;
    actions.push(
      beating
        ? `Reuse the hook from your campaign running ${pct(report.results.avgCtr)} clicks — that's above the ${pct(report.results.benchmark)} typical for your category.`
        : `Swap the opening line on the campaign sitting at ${pct(report.results.avgCtr)} clicks — your category typically runs ${pct(report.results.benchmark)}.`,
    );
  }
  if (actions.length < 2 && topDemand?.interestLevel !== null && topDemand?.interestLevel !== undefined) {
    actions.push(
      `Aim at "${topDemand.term}" while interest sits at ${topDemand.interestLevel}/100${topDemand.interestRange ? ` (90-day range ${topDemand.interestRange.min}–${topDemand.interestRange.max})` : ""}.`,
    );
  }
  if (actions.length < 2 && report.brief?.advantages?.length) {
    actions.push(`Lead with what your rivals can't say: ${report.brief.advantages[0]}`);
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
