// Re-score how directly a business's competitors compete, reading their sites
// again. `pnpm tsx scripts/rescore-rivals.ts [name] [--dry]` — dry runs print
// the new verdicts without writing.
import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { customerCoverage, DIRECT_MIN, productCoverage, readRivalSite, rescoreRivals, scoreDirectness } from "../lib/intel/direct";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const needle = (args.find((a) => !a.startsWith("--")) ?? "eskiin").toLowerCase();
  const repo = getAdminRepo();
  const business = (await repo.listAllBusinesses())
    .filter((b) => b.name.toLowerCase().includes(needle))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!business) return console.log(`no business matching "${needle}"`);
  const competitors = await repo.listCompetitors(business.id);
  console.log(`${business.name} · ${competitors.length} competitors · bar ${DIRECT_MIN}${dry ? " · DRY RUN" : ""}`);

  if (dry) {
    const [ownServices, brief] = await Promise.all([repo.listServices(business.id), repo.getBusinessBrief(business.id)]);
    for (const c of competitors) {
      const site = c.website ? await readRivalSite(c.website, { category: business.category }) : null;
      const { directness, reason } = scoreDirectness({
        ownServices,
        ownCategory: business.category,
        ownPriceBand: business.price_band,
        ownLexicon: brief?.lexicon ?? [],
        ownMarket: business.market,
        rival: { name: c.name, site },
      });
      console.log(`  ${c.name.padEnd(14)} ${String(c.directness).padStart(5)} → ${String(directness).padStart(5)} ${directness >= DIRECT_MIN ? "DIRECT" : "      "} ${reason}`);
      if (args.includes("--debug") && site) {
        const text = `${site.services.map((s) => s.name).join("\n")}\n${site.text}`;
        const product = productCoverage(ownServices.map((s) => s.name), business.category, text);
        const customer = customerCoverage(brief?.lexicon ?? [], text);
        console.log(`      site ${site.text.length} chars, ${site.services.length} items, band ${site.priceBand} · product ${product.coverage.toFixed(2)} [${product.matched.join(", ")}] · customer ${customer.coverage.toFixed(2)} [${customer.matched.join(", ")}]`);
      }
    }
    return;
  }
  const after = await rescoreRivals(repo, business, competitors);
  for (const c of after) {
    const before = competitors.find((x) => x.id === c.id)?.directness;
    console.log(`  ${c.name.padEnd(14)} ${String(before).padStart(5)} → ${String(c.directness).padStart(5)} ${(c.directness ?? 0) >= DIRECT_MIN ? "DIRECT" : "      "} ${c.directness_reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
