// Diagnostic: build a business's week of picks WITHOUT writing them, and check
// each against the pick page's acceptance rules. `pnpm tsx scripts/probe-picks.ts [name]`
import "./env";

import { getAdminRepo } from "../lib/db/admin";
import type { BrandPick } from "../lib/db/types";
import { formatBet, formatMetric, pickToText } from "../lib/picks/format";
import { generateWeekPicks } from "../lib/picks/generate";
import { weekOf } from "../lib/recommend/week";

async function main() {
  const needle = (process.argv[2] ?? "eskiin").toLowerCase();
  const repo = getAdminRepo();
  const business = (await repo.listAllBusinesses())
    .filter((b) => b.name.toLowerCase().includes(needle))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!business) return console.log(`no business matching "${needle}"`);
  const opps = await repo.listOpportunities(business.id, weekOf());
  console.log(`${business.name} · market=${business.market} · spend=${business.monthly_ad_spend} · opportunities this week: ${opps.length}`);
  const t0 = Date.now();
  const out = await generateWeekPicks(repo, business, { write: false });
  console.log(`ready ${out.ready} · draft ${out.draft} · ${Math.round((Date.now() - t0) / 1000)}s\n`);
  for (const b of out.bundles) {
    const pick = b.pick as unknown as BrandPick;
    const metric = formatMetric(pick);
    const text = pickToText({ pick, scripts: b.scripts.map((s, i) => ({ ...s, id: String(i), pick_id: "x", position: i })) });
    const deltaCount = metric.delta ? text.split(metric.delta).length - 1 : 0;
    const checks = [
      b.scripts.length === 3 ? "3 scripts" : `SCRIPTS ${b.scripts.length}`,
      pick.finding.includes(`"${pick.term}`) || pick.finding.toLowerCase().includes(pick.term.toLowerCase()) ? "finding names term" : "FINDING MISSES TERM",
      deltaCount <= 1 ? "metric once" : `METRIC x${deltaCount}`,
      b.evidence.length >= 1 ? `${b.evidence.length} evidence` : "NO EVIDENCE",
      b.evidence.every((e) => !metric.delta || !e.claim.includes(metric.delta)) ? "claims clean" : "CLAIM REPEATS METRIC",
    ];
    console.log(`#${pick.rank} [${pick.status}] ${pick.term}`);
    console.log(`  H1: ${pick.finding}`);
    console.log(`  metric: ${metric.label} · ${metric.text} · value ${pick.metric_value ?? "none"} · sparkline ${pick.sparkline.length}`);
    console.log(`  bet: ${pick.bet_what} · ${formatBet(pick)} · kill: ${pick.bet_kill_rule}`);
    console.log(`  guardrail: ${pick.guardrail ?? "(none, section omitted)"}`);
    for (const e of b.evidence) console.log(`  ${e.signal}: ${e.claim}${e.source_url ? ` <${e.source_url}>` : ""}`);
    for (const s of b.scripts) console.log(`  script ${s.variant_label} (${s.thesis}, ${s.duration_seconds}s, ${s.beats.length} beats): ${s.hook}`);
    console.log(`  checks: ${checks.join(" · ")}\n`);
  }
}

main().catch((err) => {
  console.error("[probe-picks] failed:", err);
  process.exit(1);
});
