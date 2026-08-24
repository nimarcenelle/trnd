import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { buildSeedSignals, buildSeries, SEED_LEARNINGS, SEED_TERMS } from "../lib/db/seed-data";

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

  console.log(
    `[seed] signals: ${wrote} new (of ${signals.length}); series points: ${seriesPoints}; learnings: ${SEED_LEARNINGS.length}`,
  );
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
