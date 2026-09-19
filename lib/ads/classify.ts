import type { Repo } from "@/lib/db/repo";
import type { AdAngle, AdFormat, AdHistory, HookType } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";
import { classifyAdCopy } from "@/lib/signals/adlibrary-apify";

/**
 * Every ad the brand ever ran, classified the way a creative test is: by
 * the persuasion angle, the kind of opening, and the production format.
 *
 * TRND's own tests are a handful a month; the account history is hundreds
 * of ads with results. Classifying all of them on day one gives the Track
 * record an angle-level read ("education angles beat your account on cost
 * per purchase across eleven ads") before a single brief has shipped, and
 * it averages any one bad shoot out of the read. The model reads copy and
 * creative shape when it is configured; the rules below stand in when it
 * is not, and always for a row the model did not answer.
 */

export const RULES_CLASSIFIER = "trnd-rules/1";
/** Rows per model call. Copy is short; sixty rows is a few thousand tokens. */
export const CLASSIFY_BATCH = 60;
/** Rows one pass classifies for one brand, so a first sync of a busy
 * account does not spend a day's budget at once. */
export const CLASSIFY_LIMIT = 240;

export interface AdClassification {
  angle: AdAngle;
  hook_type: HookType;
  format: AdFormat;
}

export function adWords(r: Pick<AdHistory, "copy" | "ad_name" | "campaign_name">): string {
  return (r.copy ?? r.ad_name ?? r.campaign_name ?? "").replace(/\s+/g, " ").trim();
}

/** The opening: the first sentence or line, as a viewer meets it. */
function opening(text: string): string {
  const first = text.split(/(?<=[.!?])\s+|\n/)[0] ?? text;
  return first.trim().slice(0, 160);
}

export function hookTypeOf(text: string): HookType {
  const o = opening(text);
  if (!o) return "other";
  if (/\?\s*$/.test(o) || /^(why|how|what|when|did you|do you|have you|ever|is your|are you)\b/i.test(o)) return "question";
  if (/^(stop|don'?t|never|if you|attention|hey|to everyone|for anyone|you)\b/i.test(o)) return "callout";
  if (/\b(vs\.?|versus|instead of|compared to|better than|switched from)\b/i.test(o)) return "comparison";
  if (/^(i|my|we|our|when i|last year|this is how i)\b/i.test(o) || /\bmy (story|journey)\b/i.test(o)) return "story";
  if (/\b(watch|see how|here'?s how|let me show|in one take|step by step|demo)\b/i.test(o)) return "demonstration";
  if (/\b(\d+% off|sale|free shipping|discount|code|deal|save \$?\d|bogo|bundle)\b/i.test(o)) return "offer";
  if (/\b(tired of|sick of|struggl|frustrat|problem|hate|stop (feeling|dealing)|nothing works?|still)\b/i.test(o)) return "problem";
  if (/\b(the only|the best|finally|meet|introducing|proven|works|number one|#1)\b/i.test(o)) return "claim";
  return "other";
}

export function formatOf(r: Pick<AdHistory, "creative_kind" | "copy" | "ad_name">): AdFormat {
  // Underscores are word breaks in ad names ("UGC_jenna_v2").
  const name = `${r.ad_name ?? ""}`.toLowerCase().replace(/[_\-]+/g, " ");
  if (/\bugc\b|creator/.test(name)) return "ugc";
  if (/talking ?head|founder|to camera/.test(name)) return "talking_head";
  if (/\bdemo\b|how to|tutorial/.test(name)) return "demo";
  if (/static|image|carousel|banner/.test(name)) return name.includes("carousel") ? "carousel" : "static";
  if (r.creative_kind === "carousel") return "carousel";
  if (r.creative_kind === "image") return "static";
  if (r.creative_kind === "video") return "video";
  return "unknown";
}

/** The deterministic read: what the words and the creative shape say. */
export function classifyAdRules(r: Pick<AdHistory, "copy" | "ad_name" | "campaign_name" | "creative_kind">): AdClassification {
  const text = adWords(r);
  return { angle: classifyAdCopy(text), hook_type: hookTypeOf(text), format: formatOf(r) };
}

/** The stored classification, or the rules' when none is stored. */
export function classificationOf(r: AdHistory): AdClassification {
  if (r.angle && r.hook_type && r.format) return { angle: r.angle, hook_type: r.hook_type, format: r.format };
  return classifyAdRules(r);
}

export type AdClassifier = (rows: AdHistory[]) => Promise<{ byId: Record<string, AdClassification>; model: string }>;

export interface ClassifyResult {
  classified: number;
  model: string | null;
}

/**
 * Classifies the rows of one brand that have not been classified, the
 * model first (in batches) and the rules for whatever it did not answer.
 * Never throws: it runs after a sync and after an upload.
 */
export async function classifyAdHistory(
  repo: Repo,
  businessId: string,
  opts: { classifier?: AdClassifier | null; limit?: number } = {},
): Promise<ClassifyResult> {
  let rows: AdHistory[];
  try {
    rows = (await repo.listAdHistory(businessId)).filter((r) => !r.angle || !r.hook_type || !r.format);
  } catch (err) {
    console.warn(`[ads:classify] reading ${businessId} failed:`, (err as Error).message);
    return { classified: 0, model: null };
  }
  rows = rows.filter((r) => adWords(r).length > 0).slice(0, opts.limit ?? CLASSIFY_LIMIT);
  if (rows.length === 0) return { classified: 0, model: null };

  const classifier = opts.classifier === undefined ? defaultAdClassifier() : opts.classifier;
  let modelRead: Record<string, AdClassification> = {};
  let model: string | null = null;
  if (classifier) {
    for (let i = 0; i < rows.length; i += CLASSIFY_BATCH) {
      try {
        const out = await classifier(rows.slice(i, i + CLASSIFY_BATCH));
        modelRead = { ...modelRead, ...out.byId };
        model = out.model;
      } catch (err) {
        console.warn(`[ads:classify] model batch failed, rules stand in:`, (err as Error).message);
      }
    }
  }
  const updates = rows.map((r) => {
    const read = modelRead[r.id];
    return { id: r.id, ...(read ?? classifyAdRules(r)), classifier: read ? (model as string) : RULES_CLASSIFIER };
  });
  try {
    await repo.setAdHistoryClassification(updates);
  } catch (err) {
    console.warn(`[ads:classify] writing ${businessId} failed:`, (err as Error).message);
    return { classified: 0, model };
  }
  return { classified: updates.length, model };
}

export function defaultAdClassifier(): AdClassifier | null {
  if (!isModelConfigured) return null;
  return async (rows) => {
    const { classifyAdsWithModel } = await import("@/lib/ai/openai");
    const items = rows.map((r) => ({ text: adWords(r).slice(0, 500), kind: r.creative_kind ?? null, name: r.ad_name ?? null }));
    const { value, model } = await classifyAdsWithModel(items);
    const byId: Record<string, AdClassification> = {};
    for (const a of value.ads) {
      const row = rows[a.index];
      if (row) byId[row.id] = { angle: a.angle, hook_type: a.hook_type, format: a.format };
    }
    return { byId, model };
  };
}
