import "server-only";

import { z } from "zod";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { compareProfiles, keepDirection, oddsKey, tidyOdds, type Profile, type SchoolOdds } from "./odds-core";
import { countToday, readSaved, saveFirst } from "./saved";
import { admitRate, earlyRate, type School } from "./schools";

const Reply = z.object({
  results: z.array(z.object({ school_id: z.string(), odds: z.number(), locked: z.number(), fixes: z.array(z.object({ label: z.string(), gain: z.number() })) })),
});

const SYSTEM = `You estimate one applicant's chance of admission to each listed college, for a tool called Admitted.
Start from the published admit rate and move it by how the applicant's GPA and test score compare with the published ranges.
"odds" is a whole-number percent. "locked" is the percent of that number set by things that cannot change now: GPA, scores, courses taken.
"fixes" are up to three changes the applicant can still make, each with "gain", the percentage points it adds at that school.
Only name a round the school offers: ED means binding early decision, REA means restrictive early action. Never recommend ED at a REA school.
Short sentence-case labels, like "Apply ED instead of RD". Return one result for every school_id given.`;

function describe(p: Profile, schools: School[]): string {
  const facts = schools.map((s) => {
    const early = earlyRate(s);
    return [`school_id: ${s.id}`, `name: ${s.name}`, `admit rate: ${admitRate(s).toFixed(1)}%`, `early round: ${s.early.plan}${early ? `, admitting ${early.toFixed(1)}%` : ""}`, `SAT middle 50%: ${s.sat}`].join("\n");
  });
  return `Applicant: GPA ${p.gpa.toFixed(2)}, ${p.test ? `${p.test.kind} ${p.test.score}` : "no test score"}.\n\n${facts.join("\n\n")}`;
}

export class OddsCapReached extends Error {}

/** Saved results first; the model only runs for inputs it has not seen. */
export async function oddsFor(profile: Profile, schools: School[], prior: Profile | null): Promise<SchoolOdds[]> {
  const keyed = schools.map((school) => ({ school, key: oddsKey(profile, school) }));
  const saved = await readSaved<SchoolOdds>(keyed.map((k) => k.key));
  const missing = keyed.filter((k) => !saved.has(k.key));
  if (missing.length) {
    if ((await countToday("odds")) + missing.length > env.oddsDailyCap) throw new OddsCapReached();
    const reply = await generateJson({ model: env.openaiModelFast, effort: "low", system: SYSTEM, prompt: describe(profile, missing.map((m) => m.school)), schema: Reply });
    const direction = prior ? compareProfiles(profile, prior) : null;
    const before = prior ? await readSaved<SchoolOdds>(missing.map((m) => oddsKey(prior, m.school))) : new Map<string, SchoolOdds>();
    const rows: { key: string; value: SchoolOdds }[] = [];
    for (const m of missing) {
      const raw = reply.results.find((r) => r.school_id === m.school.id);
      if (!raw) continue;
      const fresh = tidyOdds(m.school, raw);
      const last = prior ? before.get(oddsKey(prior, m.school)) : undefined;
      rows.push({ key: m.key, value: last ? keepDirection(fresh, last, direction) : fresh });
    }
    for (const [k, v] of await saveFirst("odds", rows)) saved.set(k, v);
  }
  return keyed.flatMap((k) => saved.get(k.key) ?? []);
}
