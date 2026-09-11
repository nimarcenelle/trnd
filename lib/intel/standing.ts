import type { Repo } from "@/lib/db/repo";
import type { Business, BusinessBrief, Service, StandingQuestion } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { weekOf } from "@/lib/recommend/week";

import { buildAskContext } from "./ask";

/** How many standing questions a business can keep — each costs one model
 * call a week, and more than a handful stops being "standing". */
export const MAX_STANDING_QUESTIONS = 5;

/**
 * Openers, in the owner's voice, specific to this business. The point of a
 * standing question is that it never closes — so each of these has a new
 * answer every week by construction (rivals move, terms move, the calendar
 * moves), not once.
 */
export function suggestStandingQuestions(
  business: Business,
  services: Service[],
  brief: BusinessBrief | null,
  existing: StandingQuestion[] = [],
): string[] {
  const top = services.find((s) => s.is_active) ?? null;
  const out = [
    "Who is advertising against me this week, and on what?",
    top ? `Is my ${top.name} priced right for ${business.city} right now?` : `Which of my services are people searching for most right now?`,
    "What should I be getting ready for next month?",
    brief?.customer_segments?.[0]
      ? `What is reaching ${brief.customer_segments[0].split(/[—:,(]/)[0].trim().toLowerCase()} this week?`
      : "Which of my services are people searching for most right now?",
  ];
  const have = new Set(existing.map((q) => q.question.toLowerCase()));
  return [...new Set(out)].filter((q) => !have.has(q.toLowerCase())).slice(0, 3);
}

/**
 * Answer every active standing question that hasn't been answered for this
 * week. One model call per question; the previous answer rides along so the
 * new one can say what moved. Without a model nothing is written — the
 * questions wait, and the UI says so. Errors are logged per question.
 */
export async function answerStandingQuestions(
  repo: Repo,
  business: Business,
  opts: { force?: boolean; only?: string[] } = {},
): Promise<StandingQuestion[]> {
  const questions = await repo.listStandingQuestions(business.id, { activeOnly: true });
  if (!isGeminiConfigured || questions.length === 0) return questions;
  const week = weekOf();
  const due = questions.filter(
    (q) => (opts.only ? opts.only.includes(q.id) : true) && (opts.force || q.answered_week !== week),
  );
  if (due.length === 0) return questions;
  const context = await buildAskContext(repo, business);
  const { answerAskWithGemini } = await import("@/lib/ai/gemini");
  const out = new Map(questions.map((q) => [q.id, q]));
  for (const q of due) {
    try {
      const previous = q.answered_week && q.answer.length > 0 ? { week: q.answered_week, answer: q.answer } : null;
      const { value, model } = await answerAskWithGemini(business, context, q.question, [], null, previous);
      const changed = (value.changed ?? "").trim();
      const updated = await repo.answerStandingQuestion(q.id, {
        answer: value.answer,
        changed: previous && changed.length >= 8 ? changed : null,
        answered_week: week,
        previous_answer: previous ? previous.answer : [],
        model_used: model,
      });
      out.set(q.id, updated);
    } catch (err) {
      console.warn(`[standing] question ${q.id} failed (non-fatal):`, (err as Error).message);
    }
  }
  return [...out.values()];
}
