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

import { findPage } from "@/lib/adlibrary/resolve";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { discoverRivals, tagAds, writeReport, type SocialLine } from "@/lib/ai/analyze";
import type { Ad } from "@/lib/db/types";
import { daysRunning } from "@/lib/diff";
import { env } from "@/lib/env";
import { libraryLink } from "@/lib/format";
import { engagementRate, postsPerWeek, readSocial } from "@/lib/social/read";
import { normalizeUrl, readSitePage } from "@/lib/site";

const today = new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log("·", ...a);

async function main() {
  const url = normalizeUrl(process.argv[2] ?? "");
  if (!url) throw new Error("usage: pnpm run:once yourbrand.com");
  if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY is not set (shell or .env.local).");

  log(`reading ${url}`);
  const site = await readSitePage(url);
  const found = await discoverRivals(url, site.text);
  log(`${found.name}: ${found.category} · ${found.profile.price_point} · ${found.profile.audience}`);
  log(`rivals: ${found.rivals.map((r) => r.name).join(", ")}`);

  const rivals: { name: string; website: string; pageName: string | null; error: string | null; ads: Ad[]; self?: boolean }[] = [];
  const companies = [{ name: found.name, website: new URL(url).hostname, reason: "you", self: true }, ...found.rivals.map((r) => ({ ...r, self: false }))];
  for (const r of companies) {
    try {
      const hit = await findPage({ name: r.name, website: r.website, category: found.category });
      const page = hit.page;
      if (!page) {
        log(`${r.name}: no Facebook Page running ads (searched ${"tried" in hit ? hit.tried.join(", ") : ""})`);
        rivals.push({ name: r.name, website: r.website, pageName: null, error: "no Page found", ads: [], self: r.self });
        continue;
      }
      const { ads, via, complete } = await scrapeAds({ pageId: page.pageId });
      log(`${r.name} → ${page.pageName} (found by ${"via" in hit ? hit.via : "?"}): ${ads.length} live ads via ${via}${complete ? "" : " (partial)"}`);
      rivals.push({
        name: r.name,
        website: r.website,
        pageName: page.pageName,
        error: null,
        self: r.self,
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
      rivals.push({ name: r.name, website: r.website, pageName: null, error: (err as Error).message, ads: [], self: r.self });
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

  // Organic social, for the brand only (rival handles come from their sites in the app).
  let social: SocialLine[] = [];
  if (env.apifyToken && (site.socials.instagram || site.socials.tiktok)) {
    log(`reading social: ${[site.socials.instagram, site.socials.tiktok].filter(Boolean).join(", ")}`);
    const reads = await readSocial({ instagram: site.socials.instagram ? [site.socials.instagram] : [], tiktok: site.socials.tiktok ? [site.socials.tiktok] : [] });
    social = reads.map((s) => ({
      name: `${found.name} (you)`,
      growth: null,
      profile: { platform: s.platform, handle: s.handle, followers: s.followers, posts_per_week: postsPerWeek(s.recent), engagement_rate: engagementRate(s.recent, s.followers), recent: s.recent },
    }));
  }

  log("writing the report");
  const own = rivals.find((r) => r.self)?.ads ?? [];
  const report = await writeReport({
    brand: { name: found.name, url, summary: found.summary, category: found.category, profile: found.profile },
    own,
    rivals: rivals.filter((r) => !r.self).map((r) => ({ name: r.name, ads: r.ads })),
    social,
    changes: null,
    today,
  });

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
