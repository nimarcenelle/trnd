// Diagnostic: run the X adapter live against one term.
import "./env";
import { createXAdapter, type XRead } from "../lib/signals/adapters/x";

/** What the X adapter puts in signal.raw — the column is typed `unknown`,
 * so the shape has to be restated to read it. */
type XSignalRaw = Pick<XRead, "postsPrev" | "reactions" | "top"> & {
  measuredTerm: string;
  adjusted: boolean;
};

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
    const r = s.raw as XSignalRaw;
    console.log(`posts=${s.value} (prev half ${r.postsPrev})  Δ=${s.delta_pct}%  reactions=${r.reactions}`);
    if (r.adjusted) console.log(`measured as "${r.measuredTerm}"`);
    if (r.top) console.log(`top (${r.top.reactions} reactions): ${String(r.top.text).slice(0, 120)}`);
  }
  const series = (await adapter.fetchSeries?.({ terms: [], watch: [], geo: "US", windowDays: 7 })) ?? [];
  console.log(`\nseries points: ${series.length}`);
}
void main();
