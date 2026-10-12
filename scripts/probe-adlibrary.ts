/**
 * Read the Ad Library from this machine and print what came back.
 *
 *   pnpm probe "Brand Name"           keyword search, then the matched Page
 *   pnpm probe --page 123456789       one Page's ads
 *
 * Run it from your laptop and from production to see whether Meta answers a
 * plain fetch from each.
 */
import { pickRivalPage } from "../lib/adlibrary/match";
import { scrapeAds } from "../lib/adlibrary/scrape";

async function main() {
  const args = process.argv.slice(2);
  const pageFlag = args.indexOf("--page");
  let pageId = pageFlag >= 0 ? args[pageFlag + 1] : null;
  const query = pageFlag >= 0 ? null : args.join(" ");
  if (!pageId && !query) throw new Error('usage: pnpm probe "Brand Name" | --page <id>');

  if (query) {
    const search = await scrapeAds({ query }, 60);
    console.log(`keyword "${query}": ${search.ads.length} ads via ${search.via}`);
    const pages = new Map<string, number>();
    for (const a of search.ads) pages.set(`${a.pageName} (${a.pageId})`, (pages.get(`${a.pageName} (${a.pageId})`) ?? 0) + 1);
    console.table([...pages.entries()].map(([page, ads]) => ({ page, ads })));
    const match = pickRivalPage({ name: query, website: null }, search.ads);
    console.log("matched page:", match);
    pageId = match?.pageId ?? null;
  }
  if (!pageId) return;
  const res = await scrapeAds({ pageId });
  console.log(`page ${pageId}: ${res.ads.length} active ads, complete=${res.complete}, via ${res.via}`);
  console.table(
    res.ads.slice(0, 15).map((a) => ({ id: a.archiveId, started: a.startedAt, format: a.format, variants: a.variants, body: (a.body ?? "").slice(0, 60) })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
