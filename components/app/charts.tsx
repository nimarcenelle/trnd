import { tagLabel } from "@/lib/format";

/**
 * Two small single-series charts in ink, no legend: the column header or
 * title names the series. Thin bars on a shared baseline with a 2px gap and a
 * native tooltip on each.
 */

export function LaunchBars({ counts, height = 28, width = 120 }: { counts: number[]; height?: number; width?: number }) {
  const max = Math.max(1, ...counts);
  const n = counts.length;
  const step = width / n;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={`Ads launched per week, last ${n} weeks: ${counts.join(", ")}`}>
      {counts.map((c, i) => {
        const h = c ? Math.max(2, (c / max) * (height - 2)) : 1;
        const weeksAgo = n - 1 - i;
        return (
          <g key={i}>
            <rect x={i * step} y="0" width={step} height={height} fill="transparent">
              <title>{`${weeksAgo === 0 ? "This week" : `${weeksAgo} week${weeksAgo === 1 ? "" : "s"} ago`}: ${c} launched`}</title>
            </rect>
            <rect
              x={i * step + 1}
              y={height - h}
              width={step - 2}
              height={h}
              rx="1"
              fill={c ? (weeksAgo === 0 ? "var(--ink)" : "var(--ink-3)") : "var(--line-strong)"}
              opacity={c && weeksAgo !== 0 ? 0.55 : 1}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function AngleBars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-ink-3 text-[13px]">Angles appear once ads are analyzed.</p>;
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-3">
      {rows.map(([label, n]) => (
        <li key={label} title={`${label}: ${n} live ad${n === 1 ? "" : "s"}`}>
          <div className="flex justify-between text-[13px] mb-1.5">
            <span className="text-ink-2 truncate">{tagLabel(label)}</span>
            <span className="text-ink tnum font-medium">{n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(n / max) * 100}%`, opacity: 0.8 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
