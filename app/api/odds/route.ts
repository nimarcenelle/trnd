import { oddsFor } from "@/lib/admitted/odds";
import { matchSchools, parseProfile } from "@/lib/admitted/odds-core";
import { SCHOOLS } from "@/lib/admitted/schools";
import { isOddsConfigured } from "@/lib/env";

export const maxDuration = 120;

/** Odds for a typed list of schools. Unchanged inputs return their saved numbers. */
export async function POST(request: Request): Promise<Response> {
  if (!isOddsConfigured) return Response.json({ error: "not_open" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { gpa?: unknown; test?: unknown; schools?: unknown } | null;
  const profile = body && parseProfile(body.gpa, body.test);
  if (!profile) return Response.json({ error: "bad_input" }, { status: 400 });
  const { found, pending, unknown } = matchSchools(String(body?.schools ?? ""));
  try {
    const results = found.length ? await oddsFor(profile, found) : [];
    const names = Object.fromEntries(SCHOOLS.map((s) => [s.id, { name: s.name, sat: s.sat, edition: s.edition, source: s.source }]));
    return Response.json({ results: results.map((r) => ({ ...r, school: names[r.schoolId] })), pending, unknown });
  } catch (err) {
    console.error("[odds]", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
