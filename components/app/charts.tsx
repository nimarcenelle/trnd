/**
 * Two small single-series charts, one hue (mint), no legend: the title names
 * the series. Bars are thin with rounded data-ends on a shared baseline, a 2px
 * gap between them, and a native tooltip per bar.
 */

export function LaunchBars({ counts, height = 64, labels = true }: { counts: number[]; height?: number; labels?: boolean }) {
  const max = Math.max(1, ...counts);
  const n = counts.length;
  const w = 100 / n;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full block" style={{ height }} role="img" aria-label={`Ads launched per week, last ${n} weeks: ${counts.join(", ")}`}>
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {counts.map((c, i) => {
          const h = c ? Math.max(3, (c / max) * (height - 4)) : 0;
          const weeksAgo = n - 1 - i;
          return (
            <g key={i}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent">
                <title>{`${weeksAgo === 0 ? "This week" : `${weeksAgo} week${weeksAgo === 1 ? "" : "s"} ago`}: ${c} launched`}</title>
              </rect>
              {h > 0 && (
                <rect x={i * w + w * 0.18} y={height - 1 - h} width={w * 0.64} height={h} rx="1.2" fill={weeksAgo === 0 ? "var(--mint)" : "color-mix(in srgb, var(--mint) 62%, transparent)"} pointerEvents="none" />
              )}
            </g>
          );
        })}
      </svg>
      {labels && (
        <figcaption className="flex justify-between label mt-2 !text-[10px]">
          <span>{n} wks ago</span>
          <span>peak {max}/wk</span>
          <span>This wk</span>
        </figcaption>
      )}
    </figure>
  );
}

export function AngleBars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-ink-3 text-[13px]">No tagged ads yet.</p>;
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
      {rows.map(([label, n]) => (
        <li key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline" title={`${label}: ${n} live ad${n === 1 ? "" : "s"}`}>
          <span className="text-[13px] text-ink-2 truncate">{label.charAt(0).toUpperCase() + label.slice(1).replace(/\bugc\b/g, "UGC")}</span>
          <span className="font-mono text-[12px] text-ink">{n}</span>
          <span className="col-span-2 h-[6px] rounded-full bg-bg-3 overflow-hidden">
            <span className="block h-full rounded-full bg-mint" style={{ width: `${(n / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
