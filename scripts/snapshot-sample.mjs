// Snapshots a finished free preview into components/sample/humm-preview.json, for
// the landing page's real example. Run by hand when the example should change:
//   node --env-file=.env.local scripts/snapshot-sample.mjs <preview id>
import { writeFileSync } from "node:fs";

const id = process.argv[2];
if (!id) throw new Error("Usage: node --env-file=.env.local scripts/snapshot-sample.mjs <preview id>");
const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/previews?id=eq.${id}&select=*`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(url, { headers: { apikey: key, authorization: `Bearer ${key}` } });
const [p] = await res.json();
if (!p || p.status !== "ready") throw new Error(`Preview ${id} is not ready`);

// Only what the landing page draws: the plan, the account, its videos, the creators
// ahead and the one sample video idea 1 builds on. No visitor or claim data.
const src = p.plan.ideas[0]?.source_video;
const snap = {
  id: "sample",
  handle: p.handle,
  status: "ready",
  step_started_at: null,
  author: p.author,
  videos: p.videos,
  profile: p.profile,
  hashtags: p.hashtags,
  peers: p.peers,
  sample: p.sample.filter((v) => v.videoId === src),
  trends: p.trends,
  plan: p.plan,
  goal: null,
  reason: null,
  claimed_by: null,
  created_at: p.created_at,
};
writeFileSync(new URL("../components/sample/humm-preview.json", import.meta.url), JSON.stringify(snap, null, 1) + "\n");
console.log(`Wrote @${p.handle}: ${p.videos.length} videos, ${p.peers.length} creators ahead, ${p.plan.ideas.length} ideas`);
