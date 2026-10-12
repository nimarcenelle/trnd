import SampleCreative from "./creative";
import { SAMPLE_CAMS } from "./feed";

const STATUS = {
  live: { label: "Rec", cls: "chip-rec", dot: true },
  new: { label: "New", cls: "chip-mint", dot: false },
  proven: { label: "Proven", cls: "chip-amber", dot: false },
  killed: { label: "Killed", cls: "chip-rec", dot: false },
} as const;

/** Six rival ads as camera feeds: the picture the product sells. */
export default function CameraWall({ count = 6, className = "" }: { count?: number; className?: string }) {
  const cams = SAMPLE_CAMS.slice(0, count);
  return (
    <div className={`panel p-2 ${className}`}>
      <div className="flex items-center justify-between px-2 pt-1 pb-3 label">
        <span className="flex items-center gap-2 text-ink-2">
          <i className="dot dot-rec" /> Live · 4 rivals<span className="hidden sm:inline"> · 37 ads</span>
        </span>
        <span className="hidden sm:inline">Last scan 06:00</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cams.map((c, i) => {
          const s = STATUS[c.status];
          return (
            <div key={i} className="cam aspect-[4/5] rounded-md">
              <SampleCreative spec={c.creative} id={`wall-${i}`} />
              <div className="cam-hud top">
                <span className="chip">Cam {String(i + 1).padStart(2, "0")}</span>
                <span className={`chip ${s.cls}`}>
                  {s.dot && <i className="dot dot-rec" style={{ width: 5, height: 5, boxShadow: "none" }} />}
                  {s.label}
                </span>
              </div>
              <div className="cam-hud bottom">
                <span className="chip">{c.rival}</span>
                <span className={`chip ${c.days >= 21 && c.status !== "killed" ? "chip-amber" : ""}`}>{c.days}d</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
