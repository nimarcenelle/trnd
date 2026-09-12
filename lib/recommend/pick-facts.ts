import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, Signal } from "@/lib/db/types";
import { documentFacts } from "@/lib/documents/digest";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { geoLabel } from "@/lib/signals/geo";
import { titleCase } from "@/lib/text";

import { bestTheme } from "@/lib/ads/history-read";

import { explainOpportunity } from "./explain";
import { loadSignalContext, rivalLinesOnTerm } from "./four-signals";
import { buildBusinessHistory } from "./history";
import { gradeFor } from "./grade";
import { budgetFor, buildInsights } from "./insights";
import { upcomingMoments } from "./seasonal";

/**
 * Everything the dashboard knows about one pick, serialized as the FACTS
 * block a model may write from — the read on the pick, and the answer to a
 * question about it. Built from the same calls the hero renders from, so
 * every sentence a model writes traces to a number already on the page.
 */
export interface PickFacts {
  text: string;
  /** Coarse identity of the facts — a read written from a different
   * fingerprint is stale and gets rewritten. */
  fingerprint: string;
  rank: number;
  term: string;
  /** Deterministic questions an owner would ask about this pick — the seed
   * for the Ask box until a model-written set exists. */
  questions: string[];
}

function hash(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const meter = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
// Whole dollars stay whole; a café's $3.50 drip must not become "$4" in the
// read the owner checks against their own menu board.
const dollars = (cents: number | null | undefined) =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}` : null;

export async function buildPickFacts(
  repo: Repo,
  business: Business,
  opportunity: Opportunity,
  signalIn?: Signal | null,
): Promise<PickFacts | null> {
  const signal = signalIn ?? (await repo.getSignal(opportunity.signal_id));
  if (!signal) return null;
  const [services, learnings, brief, weekOpps, , categorySignals, explained, history] = await Promise.all([
    repo.listServices(business.id),
    repo.listLearnings(business.category),
    repo.getBusinessBrief(business.id),
    repo.listOpportunities(business.id, opportunity.week_of),
    repo.getCampaignByOpportunity(opportunity.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 7 }),
    explainOpportunity(repo, business, opportunity, signal),
    buildBusinessHistory(repo, business),
  ]);
  const documents = await repo.listDocuments(business.id);

  const active = weekOpps.filter((o) => o.status !== "dismissed");
  const rank = Math.max(1, active.findIndex((o) => o.id === opportunity.id) + 1);
  const term = titleCase(signal.term);
  const grade = gradeFor(Number(opportunity.score));
  const matched = services.find((s) => s.id === opportunity.matched_service_id) ?? null;
  const thin = Number(opportunity.score) < 4.3;
  const snapshotReason = opportunity.rationale?.match(/Snapshot read: (.+)$/)?.[1] ?? null;
  const insights = buildInsights(signal, explained, {
    learnings,
    unfit: thin && !matched,
    snapshotReason,
  });
  const budget = budgetFor(business.price_band);

  const lines: string[] = [];
  lines.push(
    `Pick #${rank} of ${active.length} ranked this week: "${term}" — grade ${grade.letter} (${Number(opportunity.score).toFixed(1)}/10), ${grade.label.toLowerCase()}: ${grade.sub.toLowerCase()}.`,
  );
  lines.push(
    `Measured ${signal.geo === "US" ? "nationally" : `in ${geoLabel(signal.geo)}`} from ${signal.source.replace(/_/g, " ")} (${signal.metric_type.replace(/_/g, " ")}).`,
  );
  for (const i of insights) lines.push(`${i.headline}: ${i.detail}`);
  const c = explained.components;
  lines.push(
    `Score meters (0-100): moving ${meter(c.normalizedDelta)}, fit to the menu ${meter(c.serviceMatch)}, open door (competitors not on it) ${meter(c.competitorGap)}, track record ${meter(c.historicalLift)}.${explained.unmeasured ? " No weekly read exists yet — the total is held down for that." : ""}${explained.sparse ? " Too few searches for Google to chart at this level — an idea that fits, not a measured wave." : ""}`,
  );
  lines.push(`Why it scored this way: ${opportunity.rationale}`);
  // The four kinds of evidence, said once each: what the grade rests on.
  // Worded as reads, not "signals": the read's voice rules ban the word.
  const signalCtx = await loadSignalContext(repo, business, brief, categorySignals);
  if (explained.signalReasons) {
    const r = explained.signalReasons;
    lines.push(`Your customer: ${r.customer}.`);
    lines.push(`Your business: ${r.brand}.`);
    lines.push(`Your direct rivals: ${r.competitive}.`);
    if (explained.signals?.cultural !== null && explained.signals?.cultural !== undefined) {
      lines.push(`Short-form culture (counts least, it shapes how the ad is made more than whether to run it): ${r.cultural}.`);
    }
  }
  const targetCustomer = signalCtx.audience;
  if (targetCustomer) {
    lines.push(
      `The target customer: ${targetCustomer.who}${targetCustomer.objections.length > 0 ? ` What makes them hesitate: ${targetCustomer.objections.join("; ")}.` : ""}`,
    );
  }
  const rivalLines = rivalLinesOnTerm(signal.term, signalCtx);
  if (rivalLines.length > 0) lines.push(`What the direct rivals are doing on this: ${rivalLines.join(" | ")}.`);
  const ownBest = bestTheme(signalCtx.history);
  if (ownBest) {
    lines.push(
      `Their own ad history: ${ownBest.theme.replace(/_/g, " ")} ads ran ${Math.round(Math.abs(ownBest.vsAccount - 1) * 100)}% ${ownBest.vsAccount >= 1 ? "above" : "below"} their account average across ${ownBest.ads} ads.`,
    );
  }
  lines.push(
    matched
      ? `Matched menu item: ${matched.name}${dollars(matched.price_cents) ? ` at ${dollars(matched.price_cents)}` : " (no price listed)"}${matched.description ? ` — ${matched.description}` : ""}.`
      : `Nothing on the menu matches — running this means a new offer, not a listed one.`,
  );
  const others = services.filter((s) => s.is_active && s.id !== matched?.id).slice(0, 8);
  if (others.length > 0) {
    lines.push(
      `Other menu items: ${others.map((s) => `${s.name}${dollars(s.price_cents) ? ` (${dollars(s.price_cents)})` : ""}`).join("; ")}.`,
    );
  }
  if (opportunity.competitor_gap) lines.push(`Competition: ${opportunity.competitor_gap}.`);
  const adRead = categorySignals.find(
    (s) =>
      s.metric_type === "ad_saturation" &&
      (s.normalized_term === signal.normalized_term || s.normalized_term.startsWith(`${signal.normalized_term}_`)),
  );
  if (adRead) {
    const assessed = assessAdRead(
      (adRead.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads,
      adRead.term,
      [business.city, business.region ?? ""].filter(Boolean),
      adRead.value as number,
    );
    const sample = (assessed.ads ?? []).slice(0, 2);
    if (sample.length > 0) {
      lines.push(
        `Competitors' ads on this right now: ${sample.map((a) => `${a.advertiser} — "${a.snippet.slice(0, 120)}"`).join("; ")}.`,
      );
    }
  }
  const rivals = active.filter((o) => o.id !== opportunity.id).slice(0, 4);
  if (rivals.length > 0) {
    const named = await Promise.all(
      rivals.map(async (o) => {
        const s = await repo.getSignal(o.signal_id);
        const svc = services.find((x) => x.id === o.matched_service_id);
        const i = active.findIndex((x) => x.id === o.id) + 1;
        return `#${i} "${s ? titleCase(s.term) : "opportunity"}" grade ${gradeFor(Number(o.score)).letter}${svc ? ` (matches ${svc.name})` : ""}`;
      }),
    );
    lines.push(`The other picks this week: ${named.join("; ")}.`);
  }
  // Whether an ad has been drafted is deliberately absent — from this text
  // and from the fingerprint below. It changes on its own a few seconds
  // after the read is written, and tracking it rewrote every read twice.
  // The action bar already tells the owner whether an ad is waiting.
  lines.push(`Suggested test: ${budget.daily} a day, ${budget.test}, a 6-day A/B flight.`);
  // What TRND remembers about this term — the difference between week six
  // and week one. Absent in week one, and said so.
  const remembered = history.byTerm.get(signal.normalized_term);
  lines.push(
    remembered
      ? `Where this pick has been: ${remembered}`
      : history.weeksRanked > 1
        ? `Where this pick has been: first time in the ranking in the last ${history.weeksRanked} weeks.`
        : `Where this pick has been: first week on file — no history yet.`,
  );
  const rivalMoves = history.lines.filter((l) => l.startsWith("Rival "));
  if (rivalMoves.length > 0) lines.push(rivalMoves.slice(0, 3).join(" "));
  // What the owner uploaded — their own numbers, cited as theirs.
  for (const d of documentFacts(documents, 10)) lines.push(d);
  if (brief) {
    if (brief.positioning) lines.push(`Positioning (from the analysis): ${brief.positioning}`);
    if (brief.customer_segments.length) lines.push(`Who buys: ${brief.customer_segments.slice(0, 3).join(" | ")}`);
    if (brief.watchouts.length) lines.push(`Never: ${brief.watchouts.slice(0, 2).join(" | ")}`);
  }
  const next = upcomingMoments(business.category)[0];
  if (next) {
    lines.push(
      `Calendar: ${next.label} is ${next.daysOut} days out${next.prepNow ? " — prep window open now" : ` (prep starts ~${next.leadWeeks} weeks out)`}.`,
    );
  }

  // The owner's own questions, in their voice. Every one names something on
  // this page, so none of them fit a different pick.
  const questions: string[] = [];
  const runnerUp = rivals[0] ? await repo.getSignal(rivals[0].signal_id) : null;
  if (runnerUp) questions.push(`Why this over "${titleCase(runnerUp.term)}"?`);
  questions.push(`Is ${budget.daily} a day enough to test this?`);
  if (others[0]) questions.push(`Could I run this for my ${others[0].name} instead?`);
  questions.push(
    matched
      ? `What do I say when someone asks about ${signal.term}?`
      : `What would I need to add to my menu to run this?`,
  );

  const fingerprint = hash(
    [
      opportunity.id,
      Number(opportunity.score).toFixed(1),
      opportunity.relevance ?? "",
      opportunity.matched_service_id ?? "",
      opportunity.competitor_gap ?? "",
      // Rank is deliberately NOT here. The rerank writes reads against the
      // five rows it just ranked; the dashboard then lists those five plus
      // any older rows kept for their campaigns, so the same pick sat at a
      // different position on the page than in the job, every read came up
      // stale, and the screen said "TRND is writing the read" over a read
      // that existed. Whether the term is worth acting on does not change
      // with its neighbours.
      typeof explained.weekPct === "number" ? Math.round(explained.weekPct / 5) * 5 : "unmeasured",
      // New rival moves or a newly named customer change what the read says.
      rivalLines.length,
      targetCustomer ? "customer" : "",
      ownBest ? `${ownBest.theme}:${ownBest.ads}` : "",
      // Whether an ad has been drafted is deliberately NOT here. It used to
      // be, and it guaranteed every read was written twice: once while the
      // pick had no campaign, then invalidated the moment the auto-build
      // landed, so switching between picks showed "TRND is writing the read"
      // again on picks that already had one. The read answers whether the
      // trend is worth acting on; the existence of a draft does not change
      // that answer.
    ].join("|"),
  );

  return { text: lines.join("\n"), fingerprint, rank, term, questions: questions.slice(0, 3) };
}
