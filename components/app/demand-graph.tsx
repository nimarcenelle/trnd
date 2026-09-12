/**
 * Demand over eight weeks, in TRND points.
 *
 * The axis is the whole point of this component. Every earlier chart here
 * plotted a source's own units — a Google Trends index against the term's
 * own peak, a TikTok curve against the hashtag's own peak — which meant two
 * picks could show identical lines and be two orders of magnitude apart in
 * real people. You could read one pick off it; you could never compare two.
 *
 * Points are absolute and fixed (see lib/demand/points.ts): 0–100 mapped
 * onto estimated weekly reach with anchors that never move. So the y-axis
 * is the same axis on every pick, the height means something on its own,
 * and the caption says what it means in people — because a scale nobody can
 * convert back to reality is just a prettier index.
 */

const W = 660;
const H = 190;
const PAD = { t: 14, r: 16, b: 26, l: 34 };

export interface DemandWeek {
  /** Week-ending day, yyyy-mm-dd. */
  day: string;
  /** 0–100 TRND points. */
  points: number;
}

function weekLabel(i: number, total: number): string {
  const back = total - 1 - i;
  if (back === 0) return "This week";
  return `${back} wk${back === 1 ? "" : "s"} ago`;
}

export default function DemandGraph({
  weeks,
  caption,
  deltaPct = null,
  mode = "points",
}: {
  weeks: DemandWeek[];
  /** What the number means in people — never render the axis without it. */
  caption: string | null;
  deltaPct?: number | null;
  /** "relative" means the line is this term's own shape against its own
   * peak — readable, but not comparable with another pick. Say so. */
  mode?: "points" | "relative";
}) {
  if (weeks.length < 2) {
    return (
      <div className="demand demand--empty">
        <p className="demand__eyebrow">Demand, last 8 weeks</p>
        <p className="demand__none">
          Not enough history yet — the line fills in as the daily scan builds a record for this term.
        </p>
      </div>
    );
  }

  // Fixed 0-100 axis. Auto-scaling to the data would reintroduce exactly the
  // self-relative problem this component exists to remove: a flat line at 12
  // points and a flat line at 84 must not look the same.
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (weeks.length - 1);
  const y = (p: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - Math.min(Math.max(p, 0), 100) / 100);
  const line = weeks.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w.points).toFixed(1)}`).join(" ");
  const area =
    `${line} L${x(weeks.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  const last = weeks[weeks.length - 1];

  return (
    <figure className="demand">
      <figcaption className="demand__head">
        <span className="demand__eyebrow">
          Demand, last 8 weeks{mode === "relative" ? " · own scale" : " · TRND points"}
        </span>
        {typeof deltaPct === "number" && (
          <span className={`demand__delta ${deltaPct >= 0 ? "is-up" : "is-down"}`}>
            {deltaPct >= 0 ? "↑" : "↓"}
            {Math.abs(Math.round(deltaPct))}% this week
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="demand__svg" role="img" aria-label={caption ?? "Demand in TRND points"}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="demand__grid" />
            <text x={PAD.l - 8} y={y(g) + 3.5} className="demand__tick" textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        <path d={area} className="demand__area" />
        <path d={line} className="demand__line" />
        <circle cx={x(weeks.length - 1)} cy={y(last.points)} r="4" className="demand__dot" />
        {weeks.map((w, i) =>
          i === 0 || i === weeks.length - 1 || i === Math.floor((weeks.length - 1) / 2) ? (
            <text key={w.day} x={x(i)} y={H - 8} className="demand__tick" textAnchor={i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"}>
              {weekLabel(i, weeks.length)}
            </text>
          ) : null,
        )}
      </svg>
      {caption && <p className="demand__caption">{caption}</p>}
    </figure>
  );
}
