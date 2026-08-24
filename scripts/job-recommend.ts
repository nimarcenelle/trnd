import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { runRecommend } from "../lib/recommend/recommend";

async function main() {
  const results = await runRecommend(getAdminRepo());
  for (const r of results) {
    console.log(
      `[recommend] business ${r.businessId}: ${r.created} opportunities, top score ${r.topScore ?? "—"}`,
    );
  }
  console.log(`[recommend] processed ${results.length} businesses`);
}

main().catch((err) => {
  console.error("[recommend] failed:", err);
  process.exit(1);
});
