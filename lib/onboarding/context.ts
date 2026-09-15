import { CAMPAIGN_OBJECTIVES, PRODUCTION_FORMATS, type CampaignObjective, type ProductionFormat } from "@/lib/db/types";

/**
 * The creative context a brief needs that a website cannot say: what the
 * campaign buys, what the brand can produce, what it shot last, and what it
 * may claim. Asked once at onboarding, editable in Settings, and read by
 * every brief. Pure parsing, so the same rules serve both forms.
 */

export const OBJECTIVE_OPTIONS: { value: CampaignObjective; label: string; hint: string }[] = [
  { value: "purchases", label: "Purchases", hint: "The ad is judged on cost per purchase." },
  { value: "leads", label: "Leads or sign-ups", hint: "Judged on cost per lead." },
  { value: "traffic", label: "Traffic", hint: "Judged on cost per link click." },
  { value: "awareness", label: "Reach", hint: "Judged on attention, not purchases." },
];

export const FORMAT_OPTIONS: { value: ProductionFormat; label: string }[] = [
  { value: "talking_head", label: "Talking head to camera" },
  { value: "ugc", label: "Creator or UGC video" },
  { value: "demo", label: "Product demo" },
  { value: "static", label: "Static images" },
  { value: "editor", label: "We have an editor" },
  { value: "studio", label: "Studio shoots" },
];

export const NOTES_MAX = 1200;

export interface CreativeContext {
  campaign_objective: CampaignObjective | null;
  production_formats: ProductionFormat[];
  claims_notes: string | null;
  recent_creative_notes: string | null;
}

export function parseObjective(raw: unknown): CampaignObjective | null {
  return typeof raw === "string" && (CAMPAIGN_OBJECTIVES as readonly string[]).includes(raw) ? (raw as CampaignObjective) : null;
}

export function parseFormats(raw: unknown[]): ProductionFormat[] {
  const out: ProductionFormat[] = [];
  for (const f of PRODUCTION_FORMATS) if (raw.includes(f)) out.push(f);
  return out;
}

function note(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? Array.from(t).slice(0, NOTES_MAX).join("") : null;
}

/** Reads the context fields off a form. Every field is optional. */
export function parseCreativeContext(form: { get(name: string): unknown; getAll(name: string): unknown[] }): CreativeContext {
  return {
    campaign_objective: parseObjective(form.get("campaign_objective")),
    production_formats: parseFormats(form.getAll("production_formats")),
    claims_notes: note(form.get("claims_notes")),
    recent_creative_notes: note(form.get("recent_creative_notes")),
  };
}

/**
 * What the first week can and cannot say, from what the brand handed over.
 * A brand with no ad results gets a research-only week, labeled as one.
 */
export function firstWeekMode(input: { adHistoryRows: number; hasObjective: boolean }): { researchOnly: boolean; line: string } {
  if (input.adHistoryRows === 0) {
    return {
      researchOnly: true,
      line: "Research-only week: no ad results are on file, so nothing here is checked against what has worked for you, and no brief will say what performed. Add an Ads Manager export to change that.",
    };
  }
  if (!input.hasObjective) {
    return { researchOnly: false, line: "Your ad results are on file. Say what your campaigns optimize for and each brief's evaluation plan names the right number." };
  }
  return { researchOnly: false, line: "" };
}
