// Retire ranked picks whose moment has already passed.
//
// The freshness gate stops an expired moment from being ranked again, but a
// week's opportunities accumulate rather than replace, so anything written
// before the gate landed keeps being served. Caffe Driade was still showing
// three Labor Day picks five days after the holiday.
//
// Dismissing is the right verb: the row stays for history and the score is
// untouched, it simply stops being offered. Reversible, and costs no model
// calls.
import "./env";

import { getAdminRepo } from "../lib/db/admin";
import { isExpiredMoment, readMoment } from "../lib/recommend/freshness";
import { weekOf } from "../lib/recommend/recommend";

async function main() {
  const apply = process.argv.includes("--apply");
  const repo = getAdminRepo();
  let found = 0;
  for (const b of await repo.listAllBusinesses()) {
    for (const o of await repo.listOpportunities(b.id, weekOf())) {
      if (o.status === "dismissed") continue;
      const signal = await repo.getSignal(o.signal_id);
      if (!signal || !isExpiredMoment(signal.term)) continue;
      const m = readMoment(signal.term)!;
      found++;
      console.log(
        `${apply ? "retiring" : "would retire"}  ${b.name} — "${signal.term}" (${m.label}, ${m.daysOut}d)`,
      );
      if (apply) await repo.setOpportunityStatus(o.id, "dismissed");
    }
  }
  console.log(found === 0 ? "\nnothing expired." : `\n${found} expired pick(s)${apply ? " retired" : " — re-run with --apply"}`);
}
void main();
