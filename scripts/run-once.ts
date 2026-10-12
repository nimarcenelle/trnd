/**
 * One full TRND run for a real business, with no database and no login:
 * read the site, name the rivals, pull each rival's live Meta ads, tag them,
 * and write the report. The same code the app runs, end to end.
 *
 *   pnpm run:once glossier.com
 *
 * Needs OPENAI_API_KEY (and APIFY_TOKEN if Meta blocks the direct read), from
 * the shell or .env.local. Writes runs/<domain>.md and runs/<domain>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { pickRivalPage } from "@/lib/adlibrary/match";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { discoverRivals, tagAds, writeReport } from "@/lib/ai/analyze";
import type { Ad } from "@/lib/db/types";
import { daysRunning } from "@/lib/diff";
import { env } from "@/lib/env";
import { libraryLink } from "@/lib/format";
import { normalizeUrl, readSite } from "@/lib/site";

const today = new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log("·", ...a);

async function main() {
  const url = normalizeUrl(process.argv[2] ?? "");
  if (!url) throw new Error("usage: pnpm run:once yourbrand.com");
  if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY is not set (shell or .env.local).");

  log(`reading ${url}`);
  const site = await readSite(url);
  const found = await discoverRivals(url, site);
  log(`${found.name}: ${found.category}`);
  log(`rivals: ${found.rivals.map((r) => r.name).join(", ")}`);

  const rivals: { name: string; website: string; pageName: string | null; error: string | null; ads: Ad[] }[] = [];
  for (const r of found.rivals) {
    try {
      const search = await scrapeAds({ query: r.name }, 60);
      const page = pickRivalPage({ name: r.name, website: r.website }, search.ads);
      if (!page) {
        log(`${r.name}: no matching Facebook Page (${search.ads.length} keyword results via ${search.via})`);
        rivals.push({ name: r.name, website: r.website, pageName: null, error: "no Page found", ads: [] });
        continue;
      }
      const { ads, via, complete } = await scrapeAds({ pageId: page.pageId });
      log(`${r.name} → ${page.pageName}: ${ads.length} live ads via ${via}${complete ? "" : " (partial)"}`);
      rivals.push({
        name: r.name,
        website: r.website,
        pageName: page.pageName,
        error: null,
        ads: ads.map((a) => ({
          id: a.archiveId,
          brand_id: "",
          rival_id: r.name,
          archive_id: a.archiveId,
          page_name: a.pageName,
          body: a.body,
          title: a.title,
          cta: a.cta,
          link_url: a.linkUrl,
          format: a.format,
          image_url: a.imageUrl,
          video_url: a.videoUrl,
          platforms: a.platforms,
          variants: a.variants,
          started_at: a.startedAt,
          active: true,
          first_seen_at: "",
          last_seen_at: "",
          stopped_at: null,
          angle: null,
          hook: null,
          offer: null,
        })),
      });
    } catch (err) {
      log(`${r.name}: ${(err as Error).message}`);
      rivals.push({ name: r.name, website: r.website, pageName: null, error: (err as Error).message, ads: [] });
    }
  }

  const all = rivals.flatMap((r) => r.ads);
  if (!all.length) throw new Error("No rival ads were read, so there is nothing to analyze. See the lines above.");
  log(`tagging ${all.length} ads`);
  for (let i = 0; i < all.length; i += 60) {
    const tags = await tagAds(all.slice(i, i + 60));
    for (const t of tags) {
      const ad = all.find((a) => a.id === t.id);
      if (ad) Object.assign(ad, { angle: t.angle, hook: t.hook, offer: t.offer });
    }
  }

  log("writing the report");
  const report = await writeReport({
    brand: { name: found.name, url, summary: found.summary, category: found.category },
    rivals: rivals.map((r) => ({ name: r.name, ads: r.ads })),
    changes: null,
    today,
  });

  const md = [
    `# ${found.name}: rival ad report (${today})`,
    `${found.summary}`,
    `## ${report.headline}`,
    report.summary,
    `## What you wouldn't otherwise know`,
    ...report.insights.map((i, n) => `${n + 1}. **${i.title}** ${i.detail}\n   Evidence: ${i.evidence.map(libraryLink).join(" ") || "none"}`),
    `## Ads to make next`,
    ...report.plays.map((p, n) => `### ${n + 1}. ${p.title}\n${p.why}\n\n${p.brief}\n\nModeled on: ${p.inspired_by.map(libraryLink).join(" ")}`),
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
