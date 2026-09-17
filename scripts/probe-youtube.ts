// Diagnostic: run the deep YouTube Shorts read live and print the format.
import "./env";

import { createYoutubeAdapter } from "../lib/signals/adapters/youtube";

async function main() {
  const term = process.argv[2] ?? "cold plunge";
  const adapter = createYoutubeAdapter();
  console.log(`available=${await adapter.isAvailable()}  term="${term}"\n`);
  const signals = await adapter.fetch({
    terms: [],
    watch: [{ term, category: "Health & beauty", geo: "US-NY", locality: ["nyc", "new", "york"] }],
    geo: "US",
    windowDays: 7,
  });
  for (const s of signals) {
    // The payload is whatever the adapter kept; a diagnostic prints it as is.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = s.raw as Record<string, any>;
    console.log(`term        ${s.term}${r.adjusted ? `  (measured as "${r.measuredTerm}")` : ""}`);
    console.log(`sampled     ${r.sampled} videos, deep=${r.deep}`);
    console.log(`views       ${s.value?.toLocaleString()} this week  (prev weekly avg ${r.viewsPrev?.toLocaleString()})`);
    console.log(`uploads     ${r.uploads} this week  (prev weekly avg ${r.uploadsPrev})`);
    console.log(`velocity Δ  ${s.delta_pct === null ? "no read" : `${s.delta_pct}%`}`);
    console.log(`engagement  ${r.engagementPct}%   median length ${r.medianDurationSec}s`);
    console.log(`repeats     ${(r.repeatChannels ?? []).join(", ") || "none"}`);
    console.log(`top         "${r.top?.title}" (${r.top?.channel}) ${r.top?.views?.toLocaleString()} views, ${r.top?.durationSec}s`);
    console.log(`breakout    "${r.breakout?.title}" (${r.breakout?.channel}) ${r.breakout?.views?.toLocaleString()} views`);
    console.log(`\ncorpus (fastest first):`);
    for (const c of (r.corpus ?? []).slice(0, 8)) {
      console.log(`  ${String(c.durationSec).padStart(3)}s ${String(c.velocity).padStart(7)}/hr ${String(c.engagementPct ?? "-").padStart(5)}%  ${c.title.slice(0, 62)}`);
    }
  }
  if (signals.length === 0) console.log("no signals returned");
}
void main();
