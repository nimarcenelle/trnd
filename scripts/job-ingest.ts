import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { runIngest } from "../lib/signals/ingest";

async function main() {
  const summary = await runIngest(getAdminRepo());
  for (const r of summary.reports) {
    const status = r.skipped ? `skipped (${r.skipped})` : r.ok ? "ok" : `FAILED: ${r.error}`;
    console.log(`[ingest] ${r.adapter}: ${status} — ${r.signals} signals, ${r.seriesPoints} series points`);
  }
  console.log(`[ingest] total: ${summary.totalSignals} signals, ${summary.totalSeriesPoints} series points on ${summary.day}`);
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
