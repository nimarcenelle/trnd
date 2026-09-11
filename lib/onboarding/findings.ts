import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { weekOf } from "@/lib/recommend/week";
import { geoLabel, resolveMetro } from "@/lib/signals/geo";
import { normalizeTerm } from "@/lib/signals/normalize";
import { titleCase } from "@/lib/text";

/**
 * What TRND has actually learned about this business so far, read off the
 * tables the onboarding pipeline is filling as it fills them.
 *
 * This replaced a checklist that advanced on wall-clock time. The minute an
 * owner spends waiting for their first ranking is the most persuasive minute
 * in the product, and it used to be a progress bar timed to "typical
 * duration" — findings here are derived state, so they can never claim a
 * step that didn't happen, and they arrive in whatever order the work
 * actually lands.
 *
 * Nothing here writes. It is a read over state that already exists, so it
 * costs one dashboard poll and self-heals when a background step dies.
 */

export interface OnboardingFinding {
  key: string;
  /** True once the underlying work has actually landed in the tables. */
  done: boolean;
  /** What we found, in their own numbers. Only shown when done. */
  headline: string;
  detail?: string;
  /** What we're doing, shown while this is the step in flight. */
  pending: string;
}

/**
 * Past three minutes a background write has probably died rather than being
 * slow. The pages self-heal either way; this only decides whether to say so.
 */
const SLOW_AFTER_MS = 180_000;
export function analysisRunningSlow(startedAt: string): boolean {
  return Date.now() - new Date(startedAt).getTime() > SLOW_AFTER_MS;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export async function onboardingFindings(
  repo: Repo,
  business: Business,
): Promise<OnboardingFinding[]> {
  const metro = business.city ? resolveMetro(business.city, business.region) : null;
  const stateGeo = business.region ? `US-${business.region.toUpperCase()}` : "US";
  const geo = metro?.geo ?? stateGeo;
  const where = geoLabel(geo);

  const [services, brief, signals, competitorReads, opportunities] = await Promise.all([
    repo.listServices(business.id),
    repo.getBusinessBrief(business.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 7, geo: stateGeo }),
    repo.listCompetitorReads(business.id, { sinceDays: 7 }).catch(() => []),
    repo.listOpportunities(business.id, weekOf()),
  ]);

  const findings: OnboardingFinding[] = [];

  // ---- what they sell, and for how much
  const priced = services.filter((s) => s.price_cents && s.price_cents > 0);
  const lead = [...priced].sort((a, b) => (b.price_cents ?? 0) - (a.price_cents ?? 0))[0];
  findings.push({
    key: "services",
    done: services.length > 0,
    headline:
      priced.length > 0
        ? `Read your ${services.length} service${services.length === 1 ? "" : "s"} — ${priced.length} with prices`
        : `Read your ${services.length} service${services.length === 1 ? "" : "s"}`,
    detail: lead
      ? `Your ${titleCase(lead.name)} at ${money(lead.price_cents!)} is the one an ad can lead with. Nothing TRND writes will promise something this list doesn't carry.`
      : undefined,
    pending: "Reading your services and site",
  });

  // ---- the watchlist: the phrases their real customers use
  const watchTerms = brief?.watch_terms ?? [];
  findings.push({
    key: "brief",
    done: Boolean(brief),
    headline:
      watchTerms.length > 0
        ? `Picked ${watchTerms.length} phrases your customers actually search`
        : "Wrote your positioning read",
    detail:
      watchTerms.length > 0
        ? `Starting with "${watchTerms[0]}" — measured in the ${where}, not nationally.`
        : undefined,
    pending: "Writing your positioning read",
  });

  // ---- demand: what is moving, where they are
  const watched = new Set(watchTerms.map((t) => normalizeTerm(t)));
  const theirs = signals.filter(
    (s) =>
      s.metric_type !== "news_coverage" &&
      s.metric_type !== "ad_saturation" &&
      (watched.size === 0 || watched.has(s.normalized_term)),
  );
  const mover = [...theirs]
    .filter((s) => typeof s.delta_pct === "number")
    .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))[0];
  findings.push({
    key: "demand",
    done: theirs.length > 0,
    headline: mover
      ? `"${titleCase(mover.term)}" is ${(mover.delta_pct ?? 0) >= 0 ? "up" : "down"} ${Math.abs(Math.round(mover.delta_pct ?? 0))}% in the ${geoLabel(mover.geo)}`
      : `Measured ${theirs.length} term${theirs.length === 1 ? "" : "s"} in the ${where}`,
    detail: mover
      ? "Measured where your customers are. A trend that's real in New York and dead in your metro is not an opportunity."
      : undefined,
    pending: `Measuring demand in the ${where}`,
  });

  // ---- competition: who else is buying these words
  const saturation = signals.filter((s) => s.metric_type === "ad_saturation");
  const rivalAds = saturation.reduce((n, s) => n + (s.value ?? 0), 0);
  findings.push({
    key: "competition",
    done: saturation.length > 0 || competitorReads.length > 0,
    headline:
      rivalAds > 0
        ? `${rivalAds} competitor ad${rivalAds === 1 ? "" : "s"} running on your terms right now`
        : "Checked who else is advertising on your terms",
    detail:
      rivalAds > 0
        ? "Where nobody is bidding, your money goes further — that's a quarter of every score."
        : "Nobody local is bidding on them yet.",
    pending: "Checking who else is advertising",
  });

  // ---- the week
  findings.push({
    key: "ranking",
    done: opportunities.length > 0,
    headline: `Ranked ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} for this week`,
    detail: "Each one judged against what you actually sell, then graded.",
    pending: "Judging this week's signals against what you sell",
  });

  return findings;
}
