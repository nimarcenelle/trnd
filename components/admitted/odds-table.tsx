import { SplitBar, SplitLegend } from "./split";

export type OddsRow = { key: string; name: string; odds: number; withFixes: number; locked: number; movable: number; fix?: { kind: string; label: string; gain: number }; source?: { href: string; edition: string }; note?: string };

/** One row per school: odds, the split, and the next move. The live results and the sample are the same view. */
export default function OddsTable({ rows }: { rows: OddsRow[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="table !text-[14px]">
        <thead>
          <tr>
            <th className="!px-4">School</th>
            <th className="!px-4 text-right w-[72px]">Odds</th>
            <th className="!px-4 hidden md:table-cell w-[30%]">
              <SplitLegend />
            </th>
            <th className="!px-4 text-right w-[92px]">Up to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="!px-4 !py-3">
                <div className="font-medium">
                  {r.source ? (
                    <a className="hover:underline" href={r.source.href} target="_blank" rel="noreferrer" title={`Common Data Set ${r.source.edition}`}>
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </div>
                {r.fix && (
                  <div className="text-[13px] text-ink-2 mt-0.5">
                    {r.fix.label}
                    {r.fix.kind === "round" && <span className="tnum font-medium text-brand whitespace-nowrap"> +{r.fix.gain} pts</span>}
                  </div>
                )}
                {r.note && <div className="text-[12px] text-ink-3 mt-0.5">{r.note}</div>}
              </td>
              <td className="!px-4 !py-3 text-right tnum font-semibold">{r.odds}%</td>
              <td className="!px-4 !py-3 hidden md:table-cell">
                <SplitBar locked={r.locked} movable={r.movable} />
              </td>
              <td className="!px-4 !py-3 text-right tnum font-semibold text-brand">{r.withFixes}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
