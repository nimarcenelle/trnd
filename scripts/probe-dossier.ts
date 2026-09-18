// Diagnostic: build and print a brand's research dossier from what is stored,
// with its size, so the depth the model reasons over can be read by a person.
// `pnpm tsx scripts/probe-dossier.ts [name] [--json]`
import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { buildDossier, renderDossier } from "../lib/research/dossier";

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const needle = (args.find((a) => !a.startsWith("--")) ?? "eskiin").toLowerCase();
  const repo = getAdminRepo();
  const business = (await repo.listAllBusinesses())
    .filter((b) => b.name.toLowerCase().includes(needle))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!business) return console.log(`no business matching "${needle}"`);
  const t0 = Date.now();
  const dossier = await buildDossier(repo, business);
  const text = renderDossier(dossier);
  if (json) return console.log(JSON.stringify(dossier, null, 2));
  console.log(text);
  console.log(`\n---\n${text.length.toLocaleString("en-US")} chars, ~${Math.round(text.length / 4).toLocaleString("en-US")} tokens, built in ${Math.round((Date.now() - t0) / 1000)}s`);
  for (const sec of text.split("\n## ").slice(1)) {
    const title = sec.split("\n")[0];
    console.log(`  ${sec.length.toString().padStart(6)}  ${title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
