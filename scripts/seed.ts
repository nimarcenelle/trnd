import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { buildSeedSignals, buildSeries, SEED_LEARNINGS, SEED_TERMS } from "../lib/db/seed-data";
import { isSupabaseConfigured } from "../lib/env";

export const MASTER_EMAIL = "demo@usetrnd.com";
export const MASTER_PASSWORD = "trnd-demo";

/**
 * Demo-mode master login: a ready account with a fully set-up business so
 * `pnpm seed && pnpm dev` lands on a rich dashboard with zero signup. The
 * business is a med spa whose services match the seeded signal set — the
 * best-demoing vertical (see the sales playbook). LOCAL STORE ONLY: never
 * created in Supabase mode, where real auth owns account creation.
 */
async function seedMasterAccount(repo: ReturnType<typeof getAdminRepo>): Promise<string> {
  if (isSupabaseConfigured) return "master login: skipped (Supabase mode — sign up normally)";
  const { demoSignUp } = await import("../lib/auth/demo");
  const result = demoSignUp(MASTER_EMAIL, MASTER_PASSWORD, "TRND Demo");
  if ("error" in result) {
    return `master login: ${MASTER_EMAIL} / ${MASTER_PASSWORD} (already existed)`;
  }
  const business = await repo.createBusiness({
    owner_id: result.user.id,
    name: "Golden Hour Aesthetics",
    category: "Health & beauty",
    city: "Atlanta",
    region: "GA",
    country: "US",
    lat: null,
    lng: null,
    radius_miles: 20,
    website: null,
    price_band: "$$$",
    brand_voice_notes: "Clinical calm, no hype. We sell judgment and natural results, never discounts.",
    photo_urls: [],
  });
  const services = await repo.createServices(
    [
      { name: "Facial balancing consult", price_cents: 15000 },
      { name: "Skin barrier repair facial", price_cents: 22500 },
      { name: "Brow lamination", price_cents: 9500 },
      { name: "Hydrafacial", price_cents: 19500 },
    ].map((s) => ({ business_id: business.id, description: null, is_active: true, ...s })),
  );
  // Analysis + trial + first ranking up front, so first login skips every
  // "still writing…" state and shows the graded week immediately.
  const { buildFallbackBrief } = await import("../lib/ai/brief");
  await repo.upsertBusinessBrief(buildFallbackBrief(business, services));
  const { getOrCreateSubscription } = await import("../lib/billing");
  await getOrCreateSubscription(repo, business);
  const { recommendForBusiness } = await import("../lib/recommend/recommend");
  await recommendForBusiness(repo, business);
  return `master login: ${MASTER_EMAIL} / ${MASTER_PASSWORD} (Golden Hour Aesthetics, ready to demo)`;
}

async function main() {
  const repo = getAdminRepo();

  const signals = buildSeedSignals();
  const wrote = await repo.upsertSignals(signals);

  let seriesPoints = 0;
  for (const term of SEED_TERMS) {
    seriesPoints += await repo.upsertSeriesPoints(buildSeries(term));
  }

  for (const l of SEED_LEARNINGS) {
    await repo.upsertLearning(l);
  }

  const masterNote = await seedMasterAccount(repo);

  console.log(
    `[seed] signals: ${wrote} new (of ${signals.length}); series points: ${seriesPoints}; learnings: ${SEED_LEARNINGS.length}`,
  );
  console.log(`[seed] ${masterNote}`);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
