// Diagnostic: run the X adapter live against one term.
import "./env";
import { createXAdapter } from "../lib/signals/adapters/x";

async function main() {
  const term = process.argv[2] ?? "brunch near me";
  const adapter = createXAdapter();
  console.log(`available=${await adapter.isAvailable()}  term="${term}"\n`);
  const signals = await adapter.fetch({
    terms: [], watch: [{ term, category: "Restaurants & cafés", geo: "US-NC", locality: ["chapel", "hill", "nc"] }],
    geo: "US", windowDays: 7,
  });
  if (signals.length === 0) return console.log("no signals returned");
  for (const s of signals) {
    // The payload is whatever the adapter kept; a diagnostic prints it as is.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = s.raw as Record<string, any>;
    console.log(`posts=${s.value} (prev half ${r.postsPrev})  Δ=${s.delta_pct}%  reactions=${r.reactions}`);
    if (r.adjusted) console.log(`measured as "${r.measuredTerm}"`);
    if (r.top) console.log(`top (${r.top.reactions} reactions): ${String(r.top.text).slice(0, 120)}`);
  }
  const series = (await adapter.fetchSeries?.({ terms: [], watch: [], geo: "US", windowDays: 7 })) ?? [];
  console.log(`\nseries points: ${series.length}`);
}
void main();
