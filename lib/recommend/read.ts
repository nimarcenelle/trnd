import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, PickRead, Signal } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";

import { buildPickFacts, type PickFacts } from "./pick-facts";

/** read-1: verdict first, then the why; plus the owner's next questions. */
export const PICK_READ_PROMPT_VERSION = "read-1";

export function readVersionFor(facts: PickFacts): string {
  return `${PICK_READ_PROMPT_VERSION}/${facts.fingerprint}`;
}

/** A stored read written from different facts (or an older prompt) is
 * stale: it is not shown, and the next ensure rewrites it. */
export function readIsCurrent(read: PickRead | null, facts: PickFacts): read is PickRead {
  return Boolean(read && read.prompt_version === readVersionFor(facts));
}

/**
 * The analyst's read on one pick, model-written and cached per opportunity.
 * Idempotent on the facts fingerprint: a pick whose facts haven't moved
 * costs nothing on the second call. Without a model there is no read — the
 * deterministic insight lines stand alone — so this never blocks a screen.
 */
export async function ensurePickRead(
  repo: Repo,
  business: Business,
  opportunity: Opportunity,
  opts: { signal?: Signal | null; facts?: PickFacts | null } = {},
): Promise<PickRead | null> {
  const existing = await repo.getPickRead(opportunity.id);
  if (!isGeminiConfigured) return existing;
  const facts = opts.facts ?? (await buildPickFacts(repo, business, opportunity, opts.signal));
  if (!facts) return existing;
  if (readIsCurrent(existing, facts)) return existing;
  const { generatePickReadWithGemini } = await import("@/lib/ai/gemini");
  const { value, model } = await generatePickReadWithGemini(business, facts.text);
  return repo.upsertPickRead({
    opportunity_id: opportunity.id,
    business_id: business.id,
    paragraphs: value.paragraphs,
    questions: value.questions,
    model_used: model,
    prompt_version: readVersionFor(facts),
  });
}

/** Rank-time pass: write the read on the week's top picks so the dashboard
 * has it on first view. Best-effort and parallel — a failed read is a
 * logged warning, never a failed ranking. */
export async function writeTopPickReads(repo: Repo, business: Business, picks: Opportunity[], top = 3): Promise<void> {
  if (!isGeminiConfigured) return;
  await Promise.all(
    picks.slice(0, top).map(async (o) => {
      try {
        await ensurePickRead(repo, business, o);
      } catch (err) {
        console.warn(`[read] pick read failed for ${o.id} (non-fatal):`, (err as Error).message);
      }
    }),
  );
}
