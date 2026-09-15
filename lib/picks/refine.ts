"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { targetCustomerOf } from "@/lib/ai/brief";
import { writeConceptWithGemini, type ConceptWriterInput } from "@/lib/ai/concept-writer";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isGeminiConfigured } from "@/lib/env";
import { assembleBrief, CONCEPT_VERSION, type ConceptRules, type ConceptWrite } from "@/lib/picks/concept";
import { askFor, REFINEMENTS, rotateHook, type RefineState } from "@/lib/picks/refinements";
import { isConceptPick } from "@/lib/picks/concept-view";
import { isPickId, viewableDetail } from "@/lib/picks/detail";
import { conceptOf, factCorpus, forbiddenPhrases } from "@/lib/picks/generate";

/**
 * Targeted refinement of a brief the owner already has. The concept, the
 * approved facts and the evidence boundaries stay; only what was asked
 * changes, and the result passes the same validator as a fresh brief. The
 * previous brief rides along under refined_from, so nothing is lost.
 *
 * Without a model key the one refinement that needs no writing (change the
 * hook) is done by hand: the next alternative becomes the primary. The
 * rest say plainly that they need the model.
 */

export async function refinePickAction(_prev: RefineState, formData: FormData): Promise<RefineState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const pickId = formData.get("pickId");
  if (!isPickId(pickId)) return { error: "That test could not be found." };
  const detail = viewableDetail(await repo.getPickDetail(pickId), business.id);
  if (!detail || !isConceptPick(detail.pick)) return { error: "That test could not be found." };
  if (detail.dismissed || (detail.run && detail.run.status !== "planned")) return { error: "A launched or passed test is the record; it is not rewritten." };

  const kind = REFINEMENTS.find((r) => r.value === formData.get("kind"))?.value;
  if (!kind) return { error: "Pick what to change." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (REFINEMENTS.find((r) => r.value === kind)?.needsNote && note.length < 3) return { error: "Say what you have, in a sentence." };
  const ask = askFor(kind, note);
  const previous = conceptOf({ pick: detail.pick });
  if (!previous) return { error: "That test could not be read." };
  const { refined_from: _dropped, ...previousBrief } = detail.pick.brief;
  void _dropped;
  const stamp = { at: new Date().toISOString(), ask, brief: previousBrief };

  // The hook swap needs no writing.
  if (kind === "hook" && !isGeminiConfigured) {
    const rotated = rotateHook(detail.pick.brief);
    if (!rotated) return { error: "This brief has no alternative hook to switch to." };
    await repo.updatePickConcept(pickId, { brief: { ...rotated, refined_from: stamp } });
    await repo.createPickFeedback({ pick_id: pickId, business_id: business.id, user_id: user.id, action: "refined", reason: null, note: ask });
    revalidatePath(`/app/picks/${pickId}`);
    return { ok: true };
  }
  if (!isGeminiConfigured) {
    return { error: "This refinement needs the writing model, which is not configured here. Copy the brief and adjust it by hand, or change the hook." };
  }

  const [services, brief, documents] = await Promise.all([
    repo.listServices(business.id),
    repo.getBusinessBrief(business.id),
    repo.listDocuments(business.id).catch(() => []),
  ]);
  const claims = detail.evidence.map((e) => e.claim);
  const rules: ConceptRules = {
    term: detail.pick.term,
    corpus: factCorpus({ business, services, brief, documentFacts: documents.flatMap((d) => d.digest?.facts ?? []) }, claims),
    allowedPriceCents: services.filter((s) => s.is_active !== false && typeof s.price_cents === "number").map((s) => s.price_cents as number),
    forbiddenPhrases: forbiddenPhrases(business.claims_notes),
  };
  const input: ConceptWriterInput = {
    business,
    term: detail.pick.term,
    matchedService: null,
    services,
    brief,
    signals: { targetCustomer: brief ? targetCustomerOf(brief) : null, rivalLines: [], rivalThemes: [], ownBestTheme: null, ownTopPosts: [], medianDurationSec: null },
    evidence: detail.evidence.map((e) => ({ signal: e.signal, claim: e.claim, kind: e.kind })),
    quotes: [],
    memory: [],
    otherConcepts: [],
    durationSec: detail.pick.brief.script.duration_seconds,
    refinement: { ask, previous },
  };
  let written: ConceptWrite;
  try {
    written = (await writeConceptWithGemini(input, rules)).value;
  } catch (err) {
    console.warn(`[refine] ${pickId} failed:`, (err as Error).message);
    return { error: "The rewrite did not pass the fact check. Nothing was changed; try a narrower ask." };
  }
  // The evaluation plan and the structural unknowns are code's, not the writer's: they carry over.
  const next = assembleBrief(written, {
    evaluation: detail.pick.brief.evaluation,
    structuralUnknowns: detail.pick.brief.unknowns,
    differsFallback: detail.pick.brief.differs_from,
  });
  await repo.updatePickConcept(pickId, {
    concept_title: written.title,
    brief: { ...next, refined_from: stamp },
    brief_version: CONCEPT_VERSION,
    guardrail: written.guardrail,
    priority_reason: written.priority_reason,
    finding: written.hypothesis,
    bet_what: `${written.title}: ${written.format}`,
  });
  await repo.createPickFeedback({ pick_id: pickId, business_id: business.id, user_id: user.id, action: "refined", reason: null, note: ask });
  revalidatePath(`/app/picks/${pickId}`);
  revalidatePath("/app/picks");
  return { ok: true };
}
