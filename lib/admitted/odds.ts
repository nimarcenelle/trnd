import "server-only";

import { z } from "zod";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { calculateOdds, DEFAULT_WORDING, oddsKey, type FixWording, type Profile, type SchoolOdds } from "./odds-core";
import { countToday, readSaved, saveFirst } from "./saved";
import type { School } from "./schools";

const Reply = z.object({ results: z.array(z.object({ school_id: z.string(), essays: z.string(), activities: z.string() })) });

const SYSTEM = `You write two short fix labels for each college, for an admissions tool called Admitted.
"essays" names the essay work worth doing at that school. "activities" names how to present activities there.
Each label is under eight words, sentence case, and starts with a verb, like "Make your Why Dartmouth essay specific".
Never state a number, a statistic, a program name or a fact about the school, and never promise an admit.`;

/** The wording is the only part that needs the model; numbers never wait on it. */
async function wordingFor(p: Profile, schools: School[]): Promise<Map<string, FixWording>> {
  const reply = await generateJson({
    model: env.openaiModelFast,
    effort: "low",
    system: SYSTEM,
    prompt: `Applicant: GPA ${p.gpa.toFixed(2)}, ${p.test ? `${p.test.kind} ${p.test.score}` : "no test score"}.\nSchools:\n${schools.map((s) => `school_id: ${s.id}, name: ${s.name}`).join("\n")}`,
    schema: Reply,
  });
  return new Map(reply.results.map((r) => [r.school_id, { essays: r.essays.trim() || DEFAULT_WORDING.essays, activities: r.activities.trim() || DEFAULT_WORDING.activities }]));
}

/** Saved results first. A failed or capped wording call still shows the calculated numbers. */
export async function oddsFor(profile: Profile, schools: School[]): Promise<SchoolOdds[]> {
  const keyed = schools.map((school) => ({ school, key: oddsKey(profile, school) }));
  const saved = await readSaved<SchoolOdds>(keyed.map((k) => k.key));
  const missing = keyed.filter((k) => !saved.has(k.key));
  if (missing.length) {
    let wording: Map<string, FixWording> | null = null;
    try {
      if ((await countToday("odds")) + missing.length <= env.oddsDailyCap) wording = await wordingFor(profile, missing.map((m) => m.school));
    } catch (err) {
      console.warn("[odds] wording failed, using defaults:", (err as Error).message);
    }
    if (wording) {
      const made = wording;
      const rows = missing.map((m) => ({ key: m.key, value: calculateOdds(profile, m.school, made.get(m.school.id) ?? DEFAULT_WORDING) }));
      for (const [k, v] of await saveFirst("odds", rows)) saved.set(k, v);
    }
  }
  return keyed.map((k) => saved.get(k.key) ?? calculateOdds(profile, k.school));
}
