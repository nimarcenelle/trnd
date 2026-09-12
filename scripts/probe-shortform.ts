// Diagnostic: which short-form adapters are live, and how they degrade.
import "./env";

import { createTiktokApifyAdapter } from "../lib/signals/adapters/tiktok-apify";
import { createTiktokCcAdapter } from "../lib/signals/adapters/tiktok-cc";
import { createYoutubeAdapter } from "../lib/signals/adapters/youtube";

async function main() {
  const watch = [{ term: "cold plunge nyc", category: "Health & beauty", geo: "US-NY", locality: ["nyc", "new", "york"] }];
  for (const adapter of [createYoutubeAdapter(), createTiktokApifyAdapter(), createTiktokCcAdapter()]) {
    const available = await adapter.isAvailable();
    let note = "skipped (unavailable)";
    if (available) {
      const signals = await adapter.fetch({ terms: [], watch, geo: "US", windowDays: 7 });
      note = `${signals.length} signals`;
    }
    console.log(`${adapter.name.padEnd(14)} available=${String(available).padEnd(5)} ${note}`);
  }
}
void main();
