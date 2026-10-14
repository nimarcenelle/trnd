/**
 * One full TRND run for a real business, with no database and no login:
 * read the site, profile the brand, name the rivals, pull the brand's and
 * each rival's live Meta ads (and Instagram/TikTok with APIFY_TOKEN), tag the
 * ads, and write the report. The same code the app runs, end to end.
 *
 *   pnpm run:once glossier.com
 *
 * Needs OPENAI_API_KEY (and APIFY_TOKEN if Meta blocks the direct read), from
 * the shell or .env.local. Writes runs/<domain>.md and runs/<domain>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { daysRunning } from "@/lib/diff";
import { env } from "@/lib/env";
import { libraryLink } from "@/lib/format";
import { runPipeline } from "@/lib/pipeline";
import { normalizeUrl } from "@/lib/site";

const today = new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log("·", ...a);

async function main() {
  const url = normalizeUrl(process.argv[2] ?? "");
  if (!url) throw new Error("usage: pnpm run:once yourbrand.com");
  if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY is not set (shell or .env.local).");

  const { found, companies: rivals, report } = await runPipeline(url, { social: true, onStage: (s) => log(s) });
  log(`${found.name}: ${found.category} · ${found.profile.price_point} · ${found.profile.audience}`);
  for (const r of rivals) log(`${r.name}${r.pageName ? ` → ${r.pageName}` : ""}: ${r.error ?? `${r.ads.length} live ads`}`);

  const md = [
    `# ${found.name}: rival ad report (${today})`,
    `${found.summary}`,
    `Profile: ${found.profile.what_it_sells} · ${found.profile.price_point} (${found.profile.price_tier}) · for ${found.profile.audience}`,
    `## ${report.headline}`,
    report.summary,
    `## What you wouldn't otherwise know`,
    ...report.insights.map((i, n) => `${n + 1}. **${i.title}** ${i.detail}\n   Evidence: ${i.evidence.map((id) => (/^\d+$/.test(id) ? libraryLink(id) : id)).join(" ") || "none"}`),
    `## Where you stand`,
    report.landscape.summary,
    ...report.landscape.positions.map((p) => `- **${p.name}** (${p.price_tier}): ${p.audience}. Message: ${p.message}. Strength: ${p.strength}`),
    `Only you: ${report.landscape.you_vs_them.only_you.join("; ") || "none"}`,
    `Only them: ${report.landscape.you_vs_them.only_them.join("; ") || "none"}`,
    `Open lanes: ${report.landscape.you_vs_them.open_lanes.join("; ") || "none"}`,
    `## What to do next`,
    ...report.opportunities.map(
      (o, n) =>
        `### ${n + 1}. ${o.type.replace("_", " ").toUpperCase()}: ${o.title}\nCompetitors: ${o.competitors.join(", ")} · urgency ${o.urgency} · confidence ${o.confidence}\n\nWhat we saw: ${o.signal}\n\nLikely intent: ${o.intent}\n\nFor you: ${o.fit}\n\n**${o.recommendation}**${
          o.brief.hook
            ? `\n\nHook: "${o.brief.hook}"\nAngle: ${o.brief.angle}\nOffer: ${o.brief.offer}\nFormat: ${o.brief.format}\nCreative: ${o.brief.creative}\nAudience: ${o.brief.audience}\nTest: ${o.brief.experiment}`
            : ""
        }\n\nSignals: ${o.evidence.map((id) => (/^\d+$/.test(id) ? libraryLink(id) : id)).join(" ")}`,
    ),
    `## Rivals`,
    ...rivals.map((r) => {
      const read = report.rivals.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
      const top = [...r.ads].sort((a, b) => (daysRunning(b, today) ?? 0) - (daysRunning(a, today) ?? 0)).slice(0, 5);
      return [
        `### ${r.name}${r.pageName ? ` (Page: ${r.pageName})` : ""}: ${r.ads.length} live ads${r.error ? `, ${r.error}` : ""}`,
        read ? `${read.strategy} Watch for: ${read.watch_for}` : "",
        ...top.map((a) => `- ${daysRunning(a, today) ?? "?"}d · ${a.format}${a.variants > 1 ? ` · ${a.variants} variants` : ""} · ${a.angle ?? ""} · “${a.hook ?? (a.body ?? "").slice(0, 80)}” ${libraryLink(a.archive_id)}`),
      ].filter(Boolean).join("\n");
    }),
  ].join("\n\n");

  const slug = new URL(url).hostname.replace(/^www\./, "");
  mkdirSync("runs", { recursive: true });
  writeFileSync(`runs/${slug}.md`, md);
  writeFileSync(`runs/${slug}.json`, JSON.stringify({ brand: found, rivals, report }, null, 2));
  console.log(`\n${md}\n\nSaved runs/${slug}.md and runs/${slug}.json`);
}

main().catch((err) => {
  console.error("✗", (err as Error).message);
  process.exit(1);
});
