// Diagnostic: the four-signal read and the week's call for one business, read
// only (no ranking, ingest or writes). `pnpm tsx scripts/probe-call.ts [name]`
import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { explainOpportunity } from "../lib/recommend/explain";
import { weekOf } from "../lib/recommend/week";
import { buildIntelReport } from "../lib/report/build";

async function main() {
  const needle = (process.argv[2] ?? "bellwood").toLowerCase();
  const repo = getAdminRepo();
  const all = await repo.listAllBusinesses();
  const business = all
    .filter((b) => b.name.toLowerCase().includes(needle))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!business) {
    console.log(`no business matching "${needle}" among ${all.length}`);
    return;
  }
  console.log(`${business.name} · ${business.category} · market=${business.market} · ${business.city}`);
  const opps = await repo.listOpportunities(business.id, weekOf());
  console.log(`opportunities this week: ${opps.length}`);
  const top = opps.find((o) => o.status !== "dismissed");
  if (top) {
    const signal = await repo.getSignal(top.signal_id);
    if (signal) {
      const explained = await explainOpportunity(repo, business, top, signal);
      console.log(
        JSON.stringify(
          {
            term: signal.term,
            storedScore: Number(top.score),
            fourSignalScore: explained.score,
            signals: explained.signals,
            reasons: explained.signalReasons,
            audiencePhrase: explained.audiencePhrase,
          },
          null,
          2,
        ),
      );
    }
  }
  const report = await buildIntelReport(repo, business);
  console.log(
    JSON.stringify(
      {
        call: report.call,
        rivals: report.competitorsWatched.map((w) => ({
          name: w.name,
          direct: w.direct,
          reason: w.directnessReason,
          social: w.social?.summary ?? null,
          google: w.googleAds?.summary ?? null,
          meta: w.ads?.summary ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[probe-call] failed:", err);
  process.exit(1);
});
