// Diagnostic: build a brand's dossier and run the strategist pass over it,
// printing the read a founder would see and the raw JSON. One model call.
// `pnpm tsx scripts/probe-strategist.ts [name] [--json]`
import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { buildDossier } from "../lib/research/dossier";
import { defaultStrategist, renderStrategyRead } from "../lib/research/strategist";

async function main() {
  const args = process.argv.slice(2);
  const needle = (args.find((a) => !a.startsWith("--")) ?? "eskiin").toLowerCase();
  const repo = getAdminRepo();
  const business = (await repo.listAllBusinesses())
    .filter((b) => b.name.toLowerCase().includes(needle))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!business) return console.log(`no business matching "${needle}"`);
  const strategist = defaultStrategist();
  if (!strategist) return console.log("OPENAI_API_KEY is not set");
  const t0 = Date.now();
  const dossier = await buildDossier(repo, business);
  const { value, model } = await strategist(dossier);
  if (args.includes("--json")) console.log(JSON.stringify(value, null, 2));
  else console.log(renderStrategyRead(value, business.name));
  console.log(`\n---\n${model} · ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
