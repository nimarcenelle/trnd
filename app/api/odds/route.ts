import { oddsFor } from "@/lib/admitted/odds";
import { DEFAULT_WORD_LIMIT, reviewKey, type Review } from "@/lib/admitted/review-core";
import { readSaved } from "@/lib/admitted/saved";
import { matchSchools, parseProfile } from "@/lib/admitted/odds-core";
import { SCHOOLS } from "@/lib/admitted/schools";
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
    const key = reviewKey(essay, "", DEFAULT_WORD_LIMIT);
    const review = (await readSaved<Review>([key]).catch(() => new Map<string, Review>())).get(key);
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
