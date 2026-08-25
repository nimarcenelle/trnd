// Diagnostic: run the TikTok Creative Center adapter live and print signals.
import { createTiktokCcAdapter } from "../lib/signals/adapters/tiktok-cc";

async function main() {
  const adapter = createTiktokCcAdapter();
  const input = { terms: [], watch: [], geo: "US", windowDays: 7 };
  const signals = await adapter.fetch(input);
  const series = (await adapter.fetchSeries?.(input)) ?? [];
  console.log(
    signals
      .map((s) => `${s.category.padEnd(22)} #${s.term} Δ${s.delta_pct}% posts=${s.value}`)
      .join("\n"),
  );
  console.log(`\n${signals.length} signals · ${series.length} series points`);
}
void main();
