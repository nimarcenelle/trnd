import { SplitBar, SplitLegend } from "./split";

export type OddsRow = { key: string; name: string; odds: number; withFixes: number; locked: number; movable: number; fix?: { label: string; gain: number }; source?: { href: string; edition: string } };

/** Three headline tiles and one row per school. The live results and the homepage sample are the same view. */
export default function OddsTable({ rows, list, avgMovable }: { rows: OddsRow[]; list: number; avgMovable: number }) {
  const top = [...rows].filter((r) => r.fix).sort((a, b) => b.fix!.gain - a.fix!.gain)[0];
  const tiles = [
    { label: "At least one admit", value: `${list}%`, tone: "", cap: `across ${rows.length} ${rows.length === 1 ? "school" : "schools"}` },
    { label: "Movable", value: `${avgMovable}%`, tone: "text-brand", cap: "of your odds, on average" },
    { label: "Top fix", value: top ? `+${top.fix!.gain} pts` : "None", tone: "", cap: top ? `${top.fix!.label}, ${top.name}` : "" },
  ];
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="card px-4 py-3">
            <div className="text-[12px] text-ink-2">{t.label}</div>
            <div className={`text-[20px] font-semibold tnum tracking-tight mt-0.5 ${t.tone}`}>{t.value}</div>
            <div className="text-[12px] text-ink-3 mt-0.5">{t.cap}</div>
          </div>
        ))}
      </div>
      <div className="card mt-3 overflow-hidden">
        <table className="table !text-[14px]">
          <thead>
            <tr>
              <th className="!px-4">School</th>
              <th className="!px-4 text-right w-[72px]">Odds</th>
              <th className="!px-4 hidden md:table-cell w-[30%]">
                <SplitLegend />
              </th>
              <th className="!px-4 text-right w-[92px]">With fixes</th>
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
                      {r.fix.label} <span className="tnum font-medium text-brand whitespace-nowrap">+{r.fix.gain} pts</span>
                    </div>
                  )}
                </td>
                <td className="!px-4 !py-3 text-right tnum font-semibold">{r.odds}%</td>
                <td className="!px-4 !py-3 hidden md:table-cell">
                  <SplitBar locked={r.locked} movable={r.movable} />
                  <div className="text-[12px] text-ink-3 tnum mt-1.5">
                    {r.locked} · {r.movable}
                  </div>
                </td>
                <td className="!px-4 !py-3 text-right tnum font-semibold text-brand">{r.withFixes}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
