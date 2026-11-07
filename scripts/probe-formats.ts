/**
 * Dry run of format tracking: for each creator (or one, by handle), the formats
 * across the creators ahead of them, measured as the plan stage measures them.
 * Reads only; writes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/probe-formats.ts [handle]
 */
import { createClient } from "@supabase/supabase-js";

import { formatLabel } from "@/lib/creators/formats";
import {
  baseHitRate,
  FORMAT_DAYS,
  formatCallable,
  formatLine,
  formatRows,
  formatWorking,
  normalOf,
} from "@/lib/creators/stats";
import type { Creator, Peer, Video } from "@/lib/db/types";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const DAY = 86_400_000;

async function videos(creatorId: string, days: number): Promise<Video[]> {
  const out: Video[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("videos")
      .select("*")
      .eq("creator_id", creatorId)
      .gte("posted_at", new Date(Date.now() - days * DAY).toISOString())
      .order("posted_at", { ascending: false })
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Video[]));
    if (data.length < 1000) return out;
  }
}

async function main() {
  const only = process.argv[2];
  const { data: creators } = await sb.from("creators").select("*");
  for (const c of (creators ?? []) as Creator[]) {
    if (only && c.handle !== only) continue;
    const { data: peerRows } = await sb
      .from("peers")
      .select("*")
      .eq("creator_id", c.id);
    const peers = ((peerRows ?? []) as Peer[]).filter((p) => !p.removed_at);
    const all = await videos(c.id, 120);
    const own = all.filter((v) => v.is_self);
    const handles = new Set(peers.map((p) => p.handle));
    const peerVideos = all.filter(
      (v) =>
        !v.is_self &&
        handles.has(v.author) &&
        Date.now() - Date.parse(v.posted_at!) < 90 * DAY,
    );
    if (!peerVideos.length) continue;
    const normals = new Map(
      [...handles].map((h) => [
        h,
        normalOf(peerVideos.filter((v) => v.author === h)),
      ]),
    );
    normals.set(c.handle, normalOf(own));
    const window = peerVideos.filter(
      (v) => Date.now() - Date.parse(v.posted_at!) < 2 * FORMAT_DAYS * DAY,
    );
    const tagged = window.filter((v) => v.format).length;
    const base = baseHitRate(peerVideos, normals);
    const rows = formatRows([...peerVideos, ...own], normals);
    console.log(
      `\n@${c.handle}: ${peers.length} creators ahead, ${window.length} of their videos in the last ${2 * FORMAT_DAYS} days, ${tagged} tagged; base hit rate ${base === null ? "?" : `${Math.round(base * 100)}%`}`,
    );
    for (const r of rows) {
      const mark = formatWorking(r, base)
        ? "WORKING "
        : formatCallable(r)
          ? "callable"
          : "  noise ";
      console.log(
        `  ${mark} ${formatLabel(r.format).padEnd(20)} ${String(r.hits).padStart(2)}/${String(r.videos).padEnd(3)} ${r.creators} creators  median ${r.medianX ?? "?"}×  prior ${r.prior ? `${r.prior.hits}/${r.prior.videos}` : "untagged"}  best ${r.best ? `@${r.best.v.author} ${r.best.times}×` : "-"}  you ${r.mine.videos}`,
      );
    }
    const working = rows.filter((r) => formatWorking(r, base));
    if (working.length)
      console.log(
        "  plan input:\n" +
          working.map((r) => `    ${formatLine(r, base)}`).join("\n"),
      );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
