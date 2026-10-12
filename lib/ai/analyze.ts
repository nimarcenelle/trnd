import "server-only";

import { z } from "zod";

import type { Ad, Brand, ReportBody, Rival } from "@/lib/db/types";

import { daysRunning, PROVEN_DAYS } from "@/lib/diff";

import { generateJson } from "./openai";

/**
 * The three things the model does: read a brand's site and name its rivals,
 * tag each rival ad with its angle, and write the report a scan ends with.
 */

const SYSTEM = `You are TRND, a paid-social strategist who watches a brand's competitors' Meta ads for them.
You are concrete and specific. You name the rival and quote the ad. You never invent numbers: the Ad Library shows
no spend, impressions or results for commercial ads, so "still running after N days" and "N variants" are the
strongest evidence you have. Say "still running after 60 days", never "their best performer".`;

/* ------------------------------ site → rivals ----------------------------- */

const DiscoverySchema = z.object({
  name: z.string(),
  summary: z.string(),
  category: z.string(),
  rivals: z.array(z.object({ name: z.string(), website: z.string(), reason: z.string() })),
});
export type Discovery = z.infer<typeof DiscoverySchema>;

export async function discoverRivals(url: string, siteText: string): Promise<Discovery> {
  return generateJson({
    system: SYSTEM,
    schema: DiscoverySchema,
    prompt: `Here is the text of ${url}.

<site>
${siteText}
</site>

Return:
- name: the brand's name as customers know it.
- summary: two sentences on what it sells, at what price point, to whom.
- category: a short label for the market it competes in (e.g. "premium dog food", "shower filters").
- rivals: the 8 direct competitors most likely to be running Meta ads to the same customer. Prefer DTC brands
  of a similar size and price point over giant retailers and marketplaces (no Amazon, Walmart, Target). For each:
  the brand name exactly as it appears on its Facebook Page, its website domain (e.g. "brand.com"), and one line
  on why it competes for the same customer.`,
  });
}

/* ------------------------------- tag the ads ------------------------------ */

const TagSchema = z.object({
  ads: z.array(z.object({ id: z.string(), angle: z.string(), hook: z.string(), offer: z.string() })),
});

export interface AdTag {
  id: string;
  angle: string;
  hook: string;
  offer: string;
}

/** Angle, hook and offer for each ad, in one call per batch. */
export async function tagAds(ads: Pick<Ad, "id" | "body" | "title" | "cta" | "format">[]): Promise<AdTag[]> {
  if (!ads.length) return [];
  const lines = ads
    .map((a) => `[${a.id}] ${a.format} · ${a.title ?? ""} · ${(a.body ?? "").slice(0, 400).replace(/\s+/g, " ")} · CTA: ${a.cta ?? "-"}`)
    .join("\n");
  const { ads: tags } = await generateJson({
    system: SYSTEM,
    schema: TagSchema,
    effort: "low",
    prompt: `Tag each ad below. Return one entry per ad, with its id exactly as given.
- angle: the persuasion angle in 2-4 words (e.g. "problem/solution", "founder story", "social proof", "us vs them", "ingredient education", "price anchor", "UGC testimonial").
- hook: the opening line or idea that stops the scroll, 15 words max.
- offer: the offer or incentive (e.g. "20% off first order", "free shipping", "bundle"), or "none".

${lines}`,
  });
  return tags;
}

/* -------------------------------- the report ------------------------------ */

const ReportSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  insights: z.array(z.object({ title: z.string(), detail: z.string(), evidence: z.array(z.string()) })),
  plays: z.array(z.object({ title: z.string(), why: z.string(), brief: z.string(), inspired_by: z.array(z.string()) })),
  rivals: z.array(z.object({ name: z.string(), strategy: z.string(), watch_for: z.string() })),
});

export interface ReportInput {
  brand: Pick<Brand, "name" | "url" | "summary" | "category">;
  rivals: (Pick<Rival, "name"> & { ads: Ad[] })[];
  changes: { launched: Ad[]; stopped: Ad[]; proven: Ad[] } | null;
  today: string;
}

function adLine(ad: Ad, today: string): string {
  const days = daysRunning(ad, today);
  const parts = [
    `[${ad.archive_id}]`,
    days === null ? "start unknown" : `${days}d running`,
    ad.format,
    ad.variants > 1 ? `${ad.variants} variants` : null,
    ad.angle ? `angle: ${ad.angle}` : null,
    ad.offer && ad.offer !== "none" ? `offer: ${ad.offer}` : null,
    `"${(ad.title ? `${ad.title} — ` : "") + (ad.body ?? "").slice(0, 280).replace(/\s+/g, " ")}"`,
    ad.cta ? `CTA ${ad.cta}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function reportPrompt(input: ReportInput): string {
  const { brand, rivals, changes, today } = input;
  const rivalBlocks = rivals
    .map((r) => {
      const active = r.ads.filter((a) => a.active);
      const sorted = [...active].sort((a, b) => (daysRunning(b, today) ?? 0) - (daysRunning(a, today) ?? 0));
      return `## ${r.name}: ${active.length} active ads\n${sorted.slice(0, 25).map((a) => adLine(a, today)).join("\n") || "(no active ads)"}`;
    })
    .join("\n\n");
  const changeBlock = changes
    ? `\n\n# What changed since the last scan
Launched (${changes.launched.length}):
${changes.launched.map((a) => adLine(a, today)).join("\n") || "none"}
Stopped (${changes.stopped.length}):
${changes.stopped.map((a) => adLine(a, today)).join("\n") || "none"}
Crossed ${PROVEN_DAYS} days still running (${changes.proven.length}):
${changes.proven.map((a) => adLine(a, today)).join("\n") || "none"}`
    : "";

  return `Today is ${today}. The brand: ${brand.name} (${brand.url}), ${brand.category ?? ""}. ${brand.summary ?? ""}

Below are the active Meta ads of its competitors, longest-running first. Each line starts with the ad's archive id.
${rivalBlocks}${changeBlock}

Write the report the brand's founder reads.
- headline: one sentence, the single most useful thing to know${changes ? " about what changed" : ""}.
- summary: 3-4 sentences on what the market is doing on Meta right now.
- insights: 3-6 things the brand would not otherwise know (which angles and formats the long-running ads share,
  what offers rivals lean on, who is scaling up or going quiet, what nobody is doing). Each with the archive ids
  that show it in evidence.${changes ? " Lead with what the changes mean." : ""}
- plays: 3 ads the brand should make next, each modeled on what is working for rivals but in the brand's own
  voice: a title, why it should work (citing the evidence), a brief a creator could shoot from (hook, format,
  what is shown, the offer), and the archive ids that inspired it.
- rivals: one entry per competitor above that has ads: their strategy in one or two sentences, and what to watch for next.
Use only archive ids that appear above.`;
}

export async function writeReport(input: ReportInput): Promise<ReportBody> {
  const body = await generateJson({ system: SYSTEM, schema: ReportSchema, prompt: reportPrompt(input) });
  const known = new Set(input.rivals.flatMap((r) => r.ads.map((a) => a.archive_id)));
  // Drop any id the model made up, so every evidence link opens a real ad.
  for (const i of body.insights) i.evidence = i.evidence.filter((id) => known.has(id));
  for (const p of body.plays) p.inspired_by = p.inspired_by.filter((id) => known.has(id));
  return body;
}
