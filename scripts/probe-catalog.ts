// Diagnostic: price a list of product names against a store's live catalog,
// the way onboarding does. `pnpm tsx scripts/probe-catalog.ts <site> "Name" …`
import { fetchStorefrontCatalog, fillCatalogPrices, linkedProductHandles } from "../lib/import/catalog";
import { fetchSiteCorpus, normalizeUrl } from "../lib/import/website";

async function main() {
  const [site, ...names] = process.argv.slice(2);
  const url = normalizeUrl(site ?? "");
  if (!url) throw new Error("usage: probe-catalog <site> [names…]");
  const corpus = await fetchSiteCorpus(url, () => {});
  const catalog = await fetchStorefrontCatalog(url, corpus.pages[0].html);
  const brand = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  const linkedHandles = linkedProductHandles(corpus.pages);
  console.log(`catalog products: ${catalog.length} · pages read: ${corpus.pages.length} · linked product pages: ${linkedHandles.size}`);
  const rows = fillCatalogPrices(names.map((name) => ({ name, price: "" })), catalog, { brand, linkedHandles, append: 12 });
  for (const r of rows) console.log(`${r.price ? `$${r.price}`.padEnd(8) : "(none)  "} ${r.name}`);
}

main().catch((err) => {
  console.error("[probe-catalog] failed:", err);
  process.exit(1);
});
