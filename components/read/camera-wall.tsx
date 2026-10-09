import type { AdvertiserSummary } from "@/lib/read/gap";

import { days } from "./parts";

/**
 * The camera wall: one tile per advertiser being watched, its longest
 * running ad on screen, sorted by how long that ad has survived. Under it,
 * the pings: the facts a read turned up, written as the alerts a member
 * gets. Drawn from real summaries (names hidden when the pulse anonymizes
 * them) or the invented example. Pure markup.
 */

const LONG = 21;

function headline(s: AdvertiserSummary): string {
  const text = s.top[0]?.text ?? "";
  if (!text) return "Image or video only";
  const words = text.split(/\s+/);
  const cut = words.slice(0, 7).join(" ");
  return words.length > 7 ? `${cut}…` : cut;
}

export type Ping = { when: string; kind: "winner" | "new" | "stop" | "you"; what: string; who: string };

/** The alerts a wall would have sent this week, from what the ads say about themselves. */
export function pingsFrom(rivals: AdvertiserSummary[], own: AdvertiserSummary | null): Ping[] {
  const out: Ping[] = [];
  const sorted = [...rivals].sort((a, b) => (b.longestDays ?? 0) - (a.longestDays ?? 0));
  for (const r of sorted) {
    const top = r.top[0];
    if (!top) continue;
    if ((top.runningDays ?? 0) >= LONG) out.push({ when: "today", kind: "winner", who: r.name, what: `still paying after ${days(top.runningDays)}` });
    const fresh = r.top.find((a) => (a.runningDays ?? 99) <= 7);
    if (fresh) out.push({ when: "this week", kind: "new", who: r.name, what: `launched ${days(fresh.runningDays)} ago` });
  }
  if (own && own.active > 0) out.push({ when: "today", kind: "you", who: "Your ads", what: `${own.active} live, longest ${own.longestDays ?? "?"} days` });
  return out.slice(0, 6);
}

export default function CameraWall({ rivals, own, category, max = 4 }: { rivals: AdvertiserSummary[]; own: AdvertiserSummary | null; category: string; max?: number }) {
  const cams = [...rivals].sort((a, b) => (b.longestDays ?? 0) - (a.longestDays ?? 0)).slice(0, max);
  const pings = pingsFrom(rivals, own);
  return (
    <div className="rd-wall" aria-label={`Camera wall: ${category}`}>
      <div className="rd-cams">
        {cams.map((s, i) => {
          const top = s.top[0];
          const long = (top?.runningDays ?? 0) >= LONG;
          const fresh = (top?.runningDays ?? 99) <= 7;
          const inner = (
            <>
              <div className="rd-cam__top">
                <span>
                  <i aria-hidden="true" className={s.active === 0 ? "is-off" : undefined} />
                  CAM {String(i + 1).padStart(2, "0")}
                </span>
                <span>{top?.runningDays != null ? `${top.runningDays}d` : "–"}</span>
              </div>
              <div className="rd-cam__head">{headline(s)}</div>
              <div className="rd-cam__bot">
                <span className="rd-cam__name">{s.name}</span>
                <span className={`rd-cam__tag${long ? " is-winner" : fresh ? " is-new" : ""}`}>{long ? "Winner" : fresh ? "New" : "Testing"}</span>
              </div>
            </>
          );
          const cls = `rd-cam rd-cam--${i % 10}`;
          return top?.url ? (
            <a key={s.name} className={cls} href={top.url} target="_blank" rel="noreferrer">
              {inner}
            </a>
          ) : (
            <div key={s.name} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
      {pings.length > 0 ? (
        <div className="rd-pings">
          <div className="rd-pings__head">
            <span>Pings</span>
            <span>
              {category} · {rivals.length} camera{rivals.length === 1 ? "" : "s"}
            </span>
          </div>
          {pings.map((p, i) => (
            <div key={i} className="rd-ping">
              <span className="rd-ping__t">{p.when}</span>
              <span className={`rd-tag is-${p.kind}`}>{p.kind === "winner" ? "Winner" : p.kind === "new" ? "New" : p.kind === "stop" ? "Stopped" : "Your ads"}</span>
              <span className="rd-ping__w">
                <b>{p.who}</b> {p.what}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
