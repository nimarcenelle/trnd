// Write the read and the ad for every ranked pick that is missing one.
//
// The weekly job now generates both for all five picks, but a week ranked
// before that shipped has picks with neither, so paging lands on "TRND is
// writing..." skeletons. This fills those in without re-ranking — the
// ranking is fine, only its written output is missing.
import "./env";

import { ensureWeekCampaign } from "../lib/campaigns/auto";
import { getAdminRepo } from "../lib/db/admin";
import { ensurePickRead } from "../lib/recommend/read";
import { weekOf } from "../lib/recommend/recommend";

async function main() {
  const repo = getAdminRepo();
  for (const b of await repo.listAllBusinesses()) {
    const picks = (await repo.listOpportunities(b.id, weekOf())).filter((o) => o.status !== "dismissed");
    for (const o of picks.slice(0, 5)) {
      if (!(await repo.getPickRead(o.id))) {
        try {
          await ensurePickRead(repo, b, o);
          console.log(`read  ${b.name} — ${o.id.slice(0, 8)}`);
        } catch (e) {
          console.warn(`read  ${b.name} FAILED: ${(e as Error).message.slice(0, 70)}`);
        }
      }
      if (!(await repo.getCampaignByOpportunity(o.id))) {
        try {
          await ensureWeekCampaign(repo, b, o);
          console.log(`ad    ${b.name} — ${o.id.slice(0, 8)}`);
        } catch (e) {
          console.warn(`ad    ${b.name} FAILED: ${(e as Error).message.slice(0, 70)}`);
        }
      }
    }
  }
  console.log("backfill done");
}
void main();
