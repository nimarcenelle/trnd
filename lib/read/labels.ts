import type { HookType } from "@/lib/db/types";

/** The openings the category read names, with no server imports so the page can use them. */

export type Opening = Exclude<HookType, "other">;

export const OPENING_LABEL: Record<Opening, string> = {
  problem: "Problem-first",
  question: "Question",
  story: "Story",
  demonstration: "Demo",
  comparison: "Comparison",
  offer: "Offer",
  claim: "Bold claim",
  callout: "Call-out",
};

/** How each opening reads in a sentence ("a problem-first opening"). */
export const OPENING_PHRASE: Record<Opening, string> = {
  problem: "open on the customer's problem",
  question: "open on a question",
  story: "open on a first-person story",
  demonstration: "open on the product working",
  comparison: "open on a comparison",
  offer: "open on the offer",
  claim: "open on a bold claim",
  callout: "open by calling out who it's for",
};
