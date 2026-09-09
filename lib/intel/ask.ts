import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { buildIntelReport } from "@/lib/report/build";
import { reportFacts } from "@/lib/report/note";

export interface AskAnswer {
  answer: string[];
  citations: { claim: string; source: string }[];
  /** Assumed numbers behind any estimate — each correctable by the owner. */
  assumptions: string[];
  insufficient: boolean;
  model: string;
}

/** One prior exchange, replayed to the model so follow-ups keep the thread. */
export interface AskTurn {
  question: string;
  answer: string[];
}

/**
 * Everything TRND holds for this business, serialized as the one context
 * block the Ask model may cite. Built fresh per question — the answer is
 * only as stale as the last ingest.
 */
export async function buildAskContext(repo: Repo, business: Business): Promise<string> {
  const [report, digest, reviews, competitorReads, competitors, services, campaigns] =
    await Promise.all([
      buildIntelReport(repo, business),
      repo.getReviewDigest(business.id),
      repo.listReviews(business.id, { competitorId: null }),
      repo.listCompetitorReads(business.id, { sinceDays: 30 }),
      repo.listCompetitors(business.id),
      repo.listServices(business.id),
      repo.listCampaigns(business.id),
    ]);
  const lines: string[] = [reportFacts(report)];

  // ---- the menu: what they sell, priced
  const menu = services
    .filter((s) => s.is_active)
    .map((s) => `${s.name}${s.price_cents ? ` ($${(s.price_cents / 100).toFixed(2).replace(/\.00$/, "")})` : ""}`);
  if (menu.length > 0) lines.push(`Menu (${menu.length} active services): ${menu.join("; ")}.`);

  // ---- the founding analysis, in full — positioning already rides in via
  // reportFacts; the rest answers pricing/season/audience questions
  const brief = report.brief;
  if (brief) {
    if (brief.customer_segments.length) lines.push(`Customer segments (from your analysis): ${brief.customer_segments.join(" | ")}`);
    lines.push(`Market context (from your analysis): ${brief.market_context}`);
    lines.push(`Pricing read (from your analysis): ${brief.pricing_read}`);
    lines.push(`Seasonality (from your analysis): ${brief.seasonality}`);
    if (brief.advantages.length) lines.push(`Edges to press: ${brief.advantages.join(" | ")}`);
    if (brief.watchouts.length) lines.push(`Marketing watch-outs: ${brief.watchouts.join(" | ")}`);
    if (brief.first_moves.length) lines.push(`Recommended first moves: ${brief.first_moves.join(" | ")}`);
  }

  // ---- campaigns: what was built, what launched, where it stands
  for (const c of campaigns.slice(0, 6)) {
    lines.push(
      `Campaign (${c.created_at.slice(0, 10)}, ${c.status}${c.external_id ? `, in Meta account as ${c.external_status ?? "PAUSED"}` : ""}): hook "${c.hook.slice(0, 120)}" — angle ${c.angle.slice(0, 120)}; audience ${c.audience.who.slice(0, 100)}.`,
    );
  }

  if (digest) {
    lines.push(`Review digest (${digest.review_count} reviews): praise themes — ${digest.themes.join("; ") || "none"}. Customer phrases — ${digest.copy_hooks.join("; ") || "none"}. Complaints — ${digest.watchouts.join("; ") || "none"}.`);
  }
  for (const r of reviews.slice(0, 8)) {
    lines.push(`Own review (${r.rating}★, ${r.published_at?.slice(0, 10) ?? "undated"}): ${r.text.slice(0, 240)}`);
  }
  const byCompetitor = new Map(competitors.map((c) => [c.id, c.name]));
  for (const read of competitorReads.slice(0, 12)) {
    lines.push(`Competitor ${byCompetitor.get(read.competitor_id) ?? "unknown"} (${read.kind}, ${read.captured_at.slice(0, 10)}): ${read.summary}`);
  }
  return lines.join("\n");
}

export async function answerAsk(
  repo: Repo,
  business: Business,
  question: string,
  history: AskTurn[] = [],
): Promise<AskAnswer> {
  if (!isGeminiConfigured) {
    return {
      answer: [
        "Ask needs the model connection (GEMINI_API_KEY) to reason over your data. Everything it would cite is already on your intel report — open it for the current picture.",
      ],
      citations: [],
      assumptions: [],
      insufficient: true,
      model: "unconfigured",
    };
  }
  const context = await buildAskContext(repo, business);
  const { answerAskWithGemini } = await import("@/lib/ai/gemini");
  const { value, model } = await answerAskWithGemini(business, context, question, history);
  return { ...value, model };
}
