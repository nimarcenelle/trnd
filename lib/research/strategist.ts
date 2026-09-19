import { z } from "zod";

import { isModelConfigured } from "@/lib/env";
import { withAiContext } from "@/lib/ai/usage";

import { renderDossier, type Dossier } from "./dossier";

/**
 * The strategist pass: one model call over the whole dossier that returns
 * the account read a senior creative strategist would write before anyone
 * writes a brief. Where the brand is, what each read actually shows and
 * how far to trust it, where the brand's story and the market disagree,
 * what no rival is saying, and the five to eight angles worth a test this
 * month in priority order, each tied to a listed product and to the lines
 * of the dossier that justify it.
 *
 * The rules are the same as the brief writer's, and stricter on evidence:
 * every insight and every angle quotes the dossier, an angle must name a
 * product the catalog lists, and confidence must follow the coverage
 * section. A read that says "customers say" when no customer words were
 * read is rejected and the retry is told why.
 */

export const STRATEGIST_VERSION = "strategist-1";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const InsightSchema = z.object({
  area: z.enum(["customer", "competitive", "brand", "culture"]),
  insight: text(20, 400),
  evidence: z.array(text(8, 300)).min(1).max(4),
  confidence: z.enum(["high", "medium", "low"]),
  why_confidence: text(10, 240),
});

const AngleSchema = z.object({
  priority: z.number().int().min(1).max(12),
  title: text(4, 80),
  product: text(2, 90),
  the_bet: text(30, 500),
  why_now: text(20, 400),
  differs_from_rivals: text(10, 300),
  evidence: z.array(text(8, 300)).min(1).max(5),
  risk: text(10, 300),
  format_hint: text(4, 120),
});

export const StrategyReadSchema = z.object({
  situation: text(80, 1400),
  insights: z.array(InsightSchema).min(5).max(10),
  tensions: z.array(text(20, 300)).max(6),
  whitespace: z.array(text(20, 300)).max(6),
  angles: z.array(AngleSchema).min(3).max(8),
  unknowns: z.array(text(10, 240)).min(1).max(6),
  do_not: z.array(text(10, 240)).max(6),
});

export type StrategyRead = z.infer<typeof StrategyReadSchema>;

/* ------------------------------ validation ------------------------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Rejects a read the dossier cannot back: an angle on a product the
 * catalog does not list, or a customer-words claim when none were read. */
export function validateStrategyRead(raw: unknown, dossier: Dossier): { ok: true; value: StrategyRead } | { ok: false; error: string } {
  const parsed = StrategyReadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 4).join("; ") };
  const value = parsed.data;
  const catalog = dossier.brand.catalog.map((c) => norm(c.name));
  const problems: string[] = [];
  for (const a of value.angles) {
    const p = norm(a.product);
    if (!catalog.some((c) => c === p || c.includes(p) || p.includes(c))) problems.push(`angle "${a.title}" names a product the catalog does not list ("${a.product}")`);
  }
  const noWords = dossier.coverage.comments === 0 && dossier.coverage.reviews === 0;
  if (noWords) {
    const claims = /customers? (say|said|write|wrote|complain|mention|report|ask)|reviews? (say|show|mention)|comments? (say|show|mention)/i;
    for (const i of value.insights) if (claims.test(i.insight) && i.confidence !== "low") problems.push(`insight "${i.insight.slice(0, 60)}…" quotes customers, but no comments or reviews were read; say it as search language, or mark it low confidence`);
  }
  const priorities = value.angles.map((a) => a.priority);
  if (new Set(priorities).size !== priorities.length) problems.push("two angles share a priority; number them 1..n");
  if (problems.length > 0) return { ok: false, error: problems.slice(0, 4).join("; ") };
  value.angles.sort((a, b) => a.priority - b.priority);
  return { ok: true, value };
}

/* -------------------------------- prompt --------------------------------- */

export function buildStrategistPrompt(dossier: Dossier, feedback?: string | null): string {
  const b = dossier.business;
  return [
    `You are the senior creative strategist on ${b.name}'s account at a paid social agency. The brand is a ${b.category} (${b.market}) spending ${b.monthlyAdSpend ?? "an unknown amount"} a month on Meta and TikTok. Below is the research dossier your team compiled this week. Write the account read you would put in front of the founder before anyone writes a brief.`,
    "",
    "How to read the dossier:",
    "- The COVERAGE section is the truth about what was and was not read. Your confidence on every point must follow it. If no customer words were read, nothing here knows what customers say; search phrases are what people type, not what they feel.",
    "- Search volume is context for demand, never evidence of how a paid social ad will perform.",
    "- A rival's ad running for weeks is the only 'working' signal the Ad Library gives. Running is not proof. An ad with no text is a video or image ad whose message is unknown.",
    "- The category pool is unfiltered and includes appliances, songs and slang that share words with the brand's terms. Ignore what is not this brand's customer.",
    "- Engagement on the brand's own posts is what an audience already following it rewarded. It says nothing about cold traffic.",
    "- A weekly move ('week +110%') is the last seven days of a Google Trends index against the seven before. On a term under 5,000 searches a month it is noise and earns low confidence at most; a year of monthly volume is the durable read.",
    "- One video, one post or one ad is an anecdote. An insight needs a pattern: several rivals, several months, several posts. Say 'one video' when it is one video.",
    "- Cover every area at least once: customer, competitive, brand, culture.",
    "",
    "Return JSON:",
    "- situation: 4 to 8 sentences. Where the brand is right now, what the reads add up to, what the founder should understand first. Plain, specific, no hype.",
    "- insights: 6 to 10, each with area (customer, competitive, brand, culture), the insight in one or two sentences, evidence (1 to 4 short quotes or figures copied from the dossier, verbatim enough to find), confidence and why. An insight without a dossier line behind it is not an insight.",
    "- tensions: up to 6 places where the brand's own story (positioning, watchouts, its posts) and what the market shows (rivals, search, its results) disagree.",
    "- whitespace: up to 6 things no direct rival's ads or posts say or show that the evidence suggests this customer cares about. Only from what was read.",
    "- angles: 5 to 8 creative angles worth a paid test in the next month, priority 1 first. Each: title (3 to 8 words, the way a creative team names an idea), product (a name exactly as the CATALOG lists it), the_bet (what the ad argues and why it should beat what the brand runs now), why_now, differs_from_rivals (against the rival ads and posts above, by name), evidence (1 to 5 dossier lines), risk (the way it fails, or the claim it must not make), format_hint.",
    "- unknowns: 1 to 6 things missing from the dossier that would change this read most, in the order they would change it.",
    "- do_not: up to 6 things the evidence says not to do this month, each with the reason.",
    "",
    "Voice, hard rules:",
    "- Short plain sentences. Sentence case. No em dashes, arrows, exclamation marks, emoji or hashtags.",
    "- No hype words: revolutionize, unlock, elevate, game-changer, must-have, obsessed, viral, next level, transform, ultimate, seamless, curated, leverage.",
    "- No invented figures, results, reviews or quotes. Every number and every quote is already in the dossier or it is not in your read.",
    "- Name rivals when you compare against them. Never suggest copying a rival's line.",
    ...(feedback ? ["", "Your previous read was rejected. Fix exactly these problems and keep everything else:", `- ${feedback.replace(/;\s*/g, "\n- ")}`] : []),
    "",
    "THE DOSSIER:",
    "",
    renderDossier(dossier),
  ].join("\n");
}

/* --------------------------------- call ---------------------------------- */

export type StrategistWriter = (dossier: Dossier) => Promise<{ value: StrategyRead; model: string }>;

export async function readStrategyWithModel(dossier: Dossier, models?: { flash: string; pro: string }): Promise<{ value: StrategyRead; model: string }> {
  const { creativeCall, resolveModels } = await import("@/lib/ai/openai");
  const m = models ?? (await resolveModels());
  const validate = (raw: unknown) => {
    const checked = validateStrategyRead(raw, dossier);
    if (!checked.ok) throw new StrategyRejected(checked.error);
    return checked.value;
  };
  const run = (feedback?: string | null) => creativeCall(m, buildStrategistPrompt(dossier, feedback), StrategyReadSchema, validate);
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof StrategyRejected)) throw err;
    console.warn(`[strategist] ${dossier.business.name} read rejected (${err.message}); asking for a fix`);
    return await run(err.message);
  }
}

export class StrategyRejected extends Error {}

export function defaultStrategist(): StrategistWriter | null {
  if (!isModelConfigured) return null;
  return (dossier) => withAiContext({ businessId: null, purpose: "strategist" }, () => readStrategyWithModel(dossier));
}

/* -------------------------------- render --------------------------------- */

/** The read as a person would want it on a page or in a Slack message. */
export function renderStrategyRead(r: StrategyRead, brand: string): string {
  const out: string[] = [`# ${brand}: account read`, "", r.situation, "", "## What the reads show"];
  for (const i of r.insights) out.push(`- [${i.area}, ${i.confidence}] ${i.insight}`, ...i.evidence.map((e) => `    · ${e}`), `    (${i.why_confidence})`);
  if (r.tensions.length) out.push("", "## Tensions", ...r.tensions.map((t) => `- ${t}`));
  if (r.whitespace.length) out.push("", "## Whitespace", ...r.whitespace.map((w) => `- ${w}`));
  out.push("", "## Angles worth a test, in order");
  for (const a of r.angles) {
    out.push(`### ${a.priority}. ${a.title} (${a.product})`, `Bet: ${a.the_bet}`, `Why now: ${a.why_now}`, `Vs rivals: ${a.differs_from_rivals}`, `Format: ${a.format_hint}`, `Risk: ${a.risk}`, ...a.evidence.map((e) => `    · ${e}`), "");
  }
  out.push("## What would change this read", ...r.unknowns.map((u) => `- ${u}`));
  if (r.do_not.length) out.push("", "## Do not", ...r.do_not.map((d) => `- ${d}`));
  return out.join("\n");
}
