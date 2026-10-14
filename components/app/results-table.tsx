import type { OwnAdResult } from "@/lib/db/types";
import { compact } from "@/lib/format";
import { rankResults } from "@/lib/results";

const money = (n: number | null) => (n === null ? "—" : n >= 1000 ? `$${compact(Math.round(n))}` : `$${n.toFixed(n < 10 ? 2 : 0)}`);

/** The owner's own results: totals, the ads that worked and didn't, and the full table by spend. */
export default function ResultsTable({ rows }: { rows: OwnAdResult[] }) {
  const spend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const results = rows.reduce((s, r) => s + (r.results ?? 0), 0);
  const roasRows = rows.filter((r) => r.roas !== null && r.spend);
  const roas = roasRows.length ? roasRows.reduce((s, r) => s + r.roas! * r.spend!, 0) / roasRows.reduce((s, r) => s + r.spend!, 0) : null;
  const { best, worst } = rankResults(rows);
  const bestIds = new Set(best.map((r) => r.id));
  const worstIds = new Set(worst.map((r) => r.id));
  const period = rows.find((r) => r.period_start)?.period_start;
  const periodEnd = rows.find((r) => r.period_end)?.period_end;
  const type = rows.find((r) => r.result_type)?.result_type ?? "results";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Spend", money(spend)],
          [(type.charAt(0).toUpperCase() + type.slice(1)).replace(/([^s])$/, "$1s"), compact(results)],
          ["Cost per result", results ? money(spend / results) : "—"],
          ["ROAS", roas !== null ? `${roas.toFixed(2)}×` : "—"],
        ].map(([l, v]) => (
          <div key={l} className="card px-4 py-3.5">
            <div className="text-[13px] text-ink-2">{l}</div>
            <div className="text-[22px] font-semibold tracking-tight tnum mt-1">{v}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              <th>Ad</th>
              <th className="!text-right">Spend</th>
              <th className="!text-right">CTR</th>
              <th className="!text-right">Results</th>
              <th className="!text-right">Cost per result</th>
              <th className="!text-right">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((r) => (
              <tr key={r.id}>
                <td className="max-w-[340px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.ad_name}</span>
                    {bestIds.has(r.id) && <span className="badge badge-pos shrink-0">Best</span>}
                    {worstIds.has(r.id) && <span className="badge badge-neg shrink-0">Worst</span>}
                  </div>
                  {r.body && <div className="text-[12px] text-ink-3 truncate">{r.body}</div>}
                </td>
                <td className="text-right tnum">{money(r.spend)}</td>
                <td className="text-right tnum">{r.ctr !== null ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                <td className="text-right tnum">{r.results ?? "—"}</td>
                <td className="text-right tnum">{money(r.cost_per_result)}</td>
                <td className="text-right tnum">{r.roas !== null ? `${r.roas.toFixed(2)}×` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        {rows.length} ads{period && periodEnd ? ` · ${period} to ${periodEnd}` : ""}
        {rows.length > 15 ? " · top 15 by spend shown" : ""}
      </p>
    </div>
  );
}
