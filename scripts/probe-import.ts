// Temporary diagnostic: run the real import pipeline against live sites.
import {
  discoverInternalLinks,
  extractFromPages,
  fetchSiteCorpus,
  normalizeUrl,
} from "../lib/import/website";

async function probe(raw: string) {
  const url = normalizeUrl(raw);
  if (!url) {
    console.log(`${raw}: bad url`);
    return;
  }
  const t0 = Date.now();
  try {
    const corpus = await fetchSiteCorpus(url);
    const out = extractFromPages(corpus.pages);
    console.log(
      JSON.stringify({
        site: raw,
        ms: Date.now() - t0,
        pagesFetched: corpus.pages.map((p) => new URL(p.url).pathname),
        linksDiscovered: discoverInternalLinks(corpus.pages[0].html, url).length,
        corpusChars: corpus.text.length,
        name: out.name,
        category: out.category,
        city: out.city,
        region: out.region,
        priceBand: out.priceBand,
        servicesFound: out.services.length,
        services: out.services.slice(0, 5),
        voiceHint: out.voiceHint?.slice(0, 80),
      }),
    );
  } catch (err) {
    console.log(`${raw}: FETCH FAILED after ${Date.now() - t0}ms — ${(err as Error).message}`);
  }
}

async function main() {
  for (const s of process.argv.slice(2)) await probe(s);
}
void main();
