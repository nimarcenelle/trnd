import { z } from "zod";

import { matchSchools, parseProfile } from "./odds-core";
import { wordCount } from "./review-core";

/**
 * Reading a Common App PDF into the odds flow's answers. The model only points: it returns the first and last words
 * of the personal essay and the short fields. The essay itself is cut from the PDF's own text here, so it is always
 * the student's words exactly, and every field is checked before it fills anything in.
 */
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export const CommonAppReply = z.object({
  essay_start: z.string().describe("The first 10 words of the personal essay itself (not the prompt), copied exactly. Empty if there is no essay."),
  essay_end: z.string().describe("The last 10 words of the personal essay, copied exactly. Empty if there is no essay."),
  gpa: z.string().describe("The cumulative GPA as written, e.g. 3.92. Empty if not given."),
  test: z.string().describe("The highest SAT total (400-1600) or ACT composite (1-36), digits only. Empty if none."),
  state: z.string().describe("Two-letter US state of the home address, or INTL outside the US. Empty if not given."),
  colleges: z.array(z.string()).describe("Names of colleges listed in the application, if any."),
});
export type CommonAppReply = z.infer<typeof CommonAppReply>;

export const COMMONAPP_SYSTEM = `You read the text of a student's Common App application PDF and point to what is in it.
Copy the first and last 10 words of the personal essay exactly as they appear, so the essay can be cut from the text. Do not copy the essay prompt.
Give the cumulative GPA, the best SAT total or ACT composite, the home state and any colleges listed. Leave a field empty when the text does not state it. Never guess.`;

export type CommonAppFields = { essay: string; gpa: string; test: string; state: string; schools: string[] };

const normalize = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/** Where a snippet sits in the body, trying shorter runs of its words when the model copied it a little wrong. */
function locate(body: string, snippet: string, from: number, side: "start" | "end"): { at: number; length: number } | null {
  const words = snippet.split(" ").filter(Boolean);
  for (const n of [words.length, 6, 4]) {
    if (n !== words.length && (n > words.length || n < 3)) continue;
    const part = (side === "start" ? words.slice(0, n) : words.slice(-n)).join(" ");
    const at = body.toLowerCase().indexOf(part.toLowerCase(), from);
    if (at >= 0) return { at, length: part.length };
  }
  return null;
}

/** The essay between the two snippets, from the PDF's own text. Empty when either can't be found. */
export function cutEssay(text: string, start: string, end: string): string {
  const body = normalize(text);
  const s = normalize(start);
  const e = normalize(end);
  if (!s || !e) return "";
  const first = locate(body, s, 0, "start");
  if (!first) return "";
  const last = locate(body, e, first.at, "end");
  if (!last) return "";
  const essay = body.slice(first.at, last.at + last.length).trim();
  const words = wordCount(essay);
  return words >= 50 && words <= 1000 ? essay : "";
}

/** Only answers that pass the flow's own checks fill anything in. */
export function fieldsFrom(text: string, reply: CommonAppReply): CommonAppFields {
  const gpa = parseProfile(reply.gpa, "") ? reply.gpa.trim() : "";
  const test = reply.test.trim() && parseProfile("3.5", reply.test) ? reply.test.trim() : "";
  const state = /^([A-Z]{2}|INTL)$/.test(reply.state.trim().toUpperCase()) ? reply.state.trim().toUpperCase() : "";
  const schools = matchSchools(reply.colleges.join(", ")).found.map((s) => s.name);
  return { essay: cutEssay(text, reply.essay_start, reply.essay_end), gpa, test, state, schools };
}
