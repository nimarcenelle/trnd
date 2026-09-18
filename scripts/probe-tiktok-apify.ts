// The one live run the per-term TikTok read needs before it is trusted.
//
// The adapter's mapper was written against the actor's documented output
// (September 2026) and unit-tested on that shape, but the network path had
// never run: there was no APIFY_TOKEN on any machine that ran the code.
// Actor field names drift, and a renamed field degrades to a zero, not a
// crash — so the first live read must be judged on whether the fields the
// read depends on actually arrived. This runs ONE term (one paid run, about
// forty results, a few cents) and prints, per documented field, how many
// items carried it, plus any keys the items carry that the mapper never
// asked for (where a renamed field usually went).
//
//   APIFY_TOKEN=... pnpm tsx scripts/probe-tiktok-apify.ts "shower filter"
//
// Exit code 1 when a required field is missing on every item, so the
// verdict is readable by a script as well as a person.
import "./env";

import { env } from "../lib/env";
import { runActorSync } from "../lib/social/apify";
import { EXPECTED_FIELDS, fieldCoverage, readTikTok, toPosts, type ApifyTikTokItem } from "../lib/signals/adapters/tiktok-apify";
import { setProviderUsageSink } from "../lib/usage/providers";

const DEFAULT_ACTOR = "clockworks~tiktok-scraper";
const RESULTS = 40;

async function main() {
  const term = process.argv.slice(2).join(" ").trim() || "cold plunge";
  if (!env.apifyToken) {
    console.error("APIFY_TOKEN is not set; nothing to verify against. Set it and run again.");
    process.exit(2);
  }
  // The probe is not a brand's spend: keep the meter row out of the store.
  setProviderUsageSink(async (row) => {
    console.log(`meter: ${row.provider} ${row.operation} ${row.units} ${row.unit_label}, est ${row.est_cost_cents ?? "?"}c (${row.basis})`);
  });
  const actor = env.apifyTiktokActor || DEFAULT_ACTOR;
  console.log(`actor ${actor}, term "${term}", ${RESULTS} results asked for`);

  const items = await runActorSync<ApifyTikTokItem>(actor, {
    searchQueries: [term],
    resultsPerPage: RESULTS,
    oldestPostDateUnified: new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10),
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });

  const coverage = fieldCoverage(items);
  console.log(`\n${coverage.items} items came back\n`);
  for (const f of EXPECTED_FIELDS) {
    const n = coverage.present[f];
    console.log(`${n === 0 ? "MISSING" : n === coverage.items ? "ok     " : "partial"}  ${f.padEnd(20)} ${n}/${coverage.items}`);
  }
  if (coverage.unexpected.length > 0) {
    console.log(`\nkeys the mapper does not read: ${coverage.unexpected.join(", ")}`);
  }
  if (items.length > 0) {
    const sample = { ...items[0] } as Record<string, unknown>;
    delete sample.videoMeta;
    delete sample.authorMeta;
    console.log(`\nfirst item (videoMeta and authorMeta left out): ${JSON.stringify(sample).slice(0, 600)}`);
  }

  const read = readTikTok(toPosts(items));
  console.log(
    `\nread: ${read.uploads} this week (${read.uploadsPrev}/week before), ${read.views} views, delta ${read.deltaPct ?? "n/a"}%, ` +
      `engagement ${read.engagementPct ?? "n/a"}%, action ${read.actionPct ?? "n/a"}%, median ${read.medianDurationSec ?? "n/a"}s, ` +
      `tags ${read.hashtags.join(" ") || "none"}`,
  );

  if (!coverage.ok) {
    console.error(`\nVERDICT: the actor no longer carries ${coverage.missing.join(", ")}. Update the mapper in lib/signals/adapters/tiktok-apify.ts before switching the read on.`);
    process.exit(1);
  }
  console.log(coverage.missing.length > 0 ? `\nVERDICT: usable; ${coverage.missing.join(", ")} never arrived and will read as zero.` : "\nVERDICT: every documented field arrived. Switch it on.");
}

void main();
