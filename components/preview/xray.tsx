import { compact } from "@/lib/format";
import { xrayOf, type XrayTile } from "@/lib/preview/xray";
import type { ReadVideo } from "@/lib/tiktok/read";

/** How long the first sweep takes; each row reveals as the line passes it. */
const SWEEP_MS = 1800;

function Tile({ t, row, rows }: { t: XrayTile; row: number; rows: number }) {
  const style = {
    "--reveal": `${Math.round(((row + 0.5) / rows) * SWEEP_MS)}ms`,
    "--tint": t.tone === "above" ? (0.12 + 0.38 * t.strength).toFixed(2) : "0",
    "--dim": t.tone === "below" ? (0.45 * t.strength).toFixed(2) : "0",
  } as React.CSSProperties;
  return (
    <div className={`xray-tile ${t.lift ? "xray-lift" : ""}`} style={style}>
      <div className="xray-face">
        {t.cover ? (
          // Our own small JPEG in Storage, already sized for the tile.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-muted text-ink-2 font-semibold text-[13px] tnum">{compact(t.views)}</span>
        )}
        <span className="xray-tint" />
      </div>
      {t.cover && <span className="xray-views">{compact(t.views)}</span>}
      {t.lift && t.x !== null && <span className="xray-times">{t.x}×</span>}
    </div>
  );
}

/**
 * The account X-ray: the creator's own grid, grey at first, a pink line sweeping
 * down and each row taking its read as the line passes it; the biggest
 * breakouts then lift out. While the preview works, the line keeps sweeping.
 */
export default function Xray({ videos }: { videos: ReadVideo[] }) {
  const { tiles, usual, lifted } = xrayOf(videos);
  if (!tiles.length) return null;
  const rows = Math.ceil(tiles.length / 3);
  const best = lifted.map((t) => `${t.x}×`).join(" and ");
  return (
    <figure className="card p-4 grid gap-3 m-0">
      <figcaption className="grid gap-0.5">
        <span className="font-bold">Your last {tiles.length} videos</span>
        <span className="caption">
          {usual !== null ? `Usually ${compact(usual)} views. Green beat that, faded fell short.` : "Too new to tell your usual views yet."}
          {lifted.length > 0 && ` Your biggest: ${best} your usual.`}
        </span>
      </figcaption>
      <div className="xray" style={{ "--sweep": `${SWEEP_MS}ms`, "--lifted": `${SWEEP_MS + 150}ms` } as React.CSSProperties} aria-hidden="true">
        {tiles.map((t, i) => (
          <Tile key={t.id} t={t} row={Math.floor(i / 3)} rows={rows} />
        ))}
        <span className="xray-scan" />
        <span className="xray-scan xray-scan-idle" />
      </div>
    </figure>
  );
}
