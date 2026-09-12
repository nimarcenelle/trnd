// Diagnostic: run the real import crawl against live sites and print what
// it found — pages, links, menu files, offerings. `pnpm tsx scripts/probe-import.ts <site>…`
import {
  discoverMenuFiles,
  discoverSitemapPages,
  extractFromPages,
  fetchSiteCorpus,
  normalizeUrl,
  probeStorefrontProducts,
} from "../lib/import/website";

async function probe(raw: string) {
  const url = normalizeUrl(raw);
  if (!url) {
    console.log(`${raw}: bad url`);
    return;
  }
  const t0 = Date.now();
  try {
    const corpus = await fetchSiteCorpus(url, (e) => console.log(`  … ${e.kind} ${"path" in e ? e.path : e.paths.join(", ")}`));
    const out = extractFromPages(corpus.pages);
    const menuFiles = discoverMenuFiles(corpus.pages);
    const products = out.services.length === 0 ? await probeStorefrontProducts(url, corpus.pages[0].html) : [];
    console.log(
      JSON.stringify(
        {
          site: raw,
          ms: Date.now() - t0,
          pagesFetched: corpus.pages.map((p) => new URL(p.url).pathname),
          sitemapPages: (await discoverSitemapPages(url)).slice(0, 12).map((u) => new URL(u).pathname),
          corpusChars: corpus.text.length,
          name: out.name,
          category: out.category,
          city: out.city,
          region: out.region,
          priceBand: out.priceBand,
          menuHost: out.menuHost,
          menuFiles: menuFiles.map((m) => new URL(m).pathname.split("/").pop()),
          servicesFound: out.services.length,
          services: out.services.slice(0, 5),
          storefrontProducts: products.length,
          photos: out.photos?.length ?? 0,
          voiceHint: out.voiceHint?.slice(0, 80),
        },
        null,
        1,
      ),
    );
  } catch (err) {
    console.log(`${raw}: FETCH FAILED after ${Date.now() - t0}ms — ${(err as Error).message}`);
  }
}

async function main() {
  for (const s of process.argv.slice(2)) await probe(s);
}
void main();
