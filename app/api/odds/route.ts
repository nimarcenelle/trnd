import { oddsFor } from "@/lib/essayodds/odds";
import { DEFAULT_WORD_LIMIT, quickKey, reviewKey, type Review } from "@/lib/essayodds/review-core";
import { readSaved } from "@/lib/essayodds/saved";
import { matchSchools, parseProfile } from "@/lib/essayodds/odds-core";
import { SCHOOLS } from "@/lib/essayodds/schools";
import { isOddsConfigured } from "@/lib/env";

export const maxDuration = 120;

/** Odds for a typed list of schools. Unchanged inputs return their saved numbers. */
export async function POST(request: Request): Promise<Response> {
  if (!isOddsConfigured) return Response.json({ error: "not_open" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { gpa?: unknown; test?: unknown; schools?: unknown; home?: unknown; essay?: unknown } | null;
  const profile = body && parseProfile(body.gpa, body.test, body.home);
  if (!profile) return Response.json({ error: "bad_input" }, { status: 400 });
  // The essay counts only through the review we already saved for it, never a score sent from the page.
  const essay = String(body?.essay ?? "").trim();
  if (essay) {
    // The full review wins once it exists; until then, the quick read the flow just made.
    const full = reviewKey(essay, "", DEFAULT_WORD_LIMIT);
    const quick = quickKey(essay);
    const saved = await readSaved<Review>([full, quick]).catch(() => new Map<string, Review>());
    const review = saved.get(full) ?? saved.get(quick);
    if (review) profile.essay = review.score;
  }
  const { found, pending, unknown } = matchSchools(String(body?.schools ?? ""));
  try {
    const results = found.length ? await oddsFor(profile, found) : [];
    const names = Object.fromEntries(SCHOOLS.map((s) => [s.id, { name: s.name, sat: s.sat, edition: s.edition, source: s.source, note: s.oddsNote }]));
    return Response.json({ results: results.map((r) => ({ ...r, school: names[r.schoolId] })), essay: profile.essay ?? null, pending, unknown });
  } catch (err) {
    console.error("[odds]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
