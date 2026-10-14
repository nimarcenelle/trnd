import type { Landscape as L } from "@/lib/db/types";
import { compact } from "@/lib/format";

import Avatar from "./avatar";

const TIER = { budget: "Budget", mid: "Mid", premium: "Premium", unknown: "—" } as const;

export interface LandscapeStats {
  liveAds: number;
  longest: number;
  instagram: number | null;
  tiktok: number | null;
}

/** Where the brand sits against every rival: positioning from the report, numbers from the scans. */
export function LandscapeTable({ landscape, you, stats }: { landscape: L; you: string; stats: (name: string) => LandscapeStats | null }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-[860px]">
        <thead>
          <tr>
            <th>Company</th>
            <th>Price</th>
            <th>Who they target</th>
            <th>Main message</th>
            <th className="!text-right">Live ads</th>
            <th className="!text-right">Instagram</th>
            <th className="!text-right">TikTok</th>
          </tr>
        </thead>
        <tbody>
          {landscape.positions.map((p) => {
            const isYou = p.name.toLowerCase() === you.toLowerCase();
            const s = stats(p.name);
            return (
              <tr key={p.name} className={isYou ? "bg-subtle" : ""}>
                <td className="whitespace-nowrap">
                  <span className="flex items-center gap-2.5 font-medium">
                    <Avatar name={p.name} size={22} />
                    {p.name}
                    {isYou && <span className="badge">You</span>}
                  </span>
                </td>
                <td>{TIER[p.price_tier]}</td>
                <td className="text-ink-2 max-w-[220px]">{p.audience}</td>
                <td className="text-ink-2 max-w-[260px]">{p.message}</td>
                <td className="text-right tnum">{s ? s.liveAds : "—"}</td>
                <td className="text-right tnum">{compact(s?.instagram)}</td>
                <td className="text-right tnum">{compact(s?.tiktok)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** What only the brand does, what only its rivals do, and what nobody does well. */
export function YouVsThem({ landscape }: { landscape: L }) {
  const cols = [
    { title: "Only you", tone: "text-pos", items: landscape.you_vs_them.only_you, empty: "Nothing yet that no competitor also does." },
    { title: "Only them", tone: "text-neg", items: landscape.you_vs_them.only_them, empty: "Nothing they lean on that you don't." },
    { title: "Open lanes", tone: "text-warn", items: landscape.you_vs_them.open_lanes, empty: "No obvious gaps found." },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cols.map((c) => (
        <div key={c.title} className="card p-5">
          <h3 className={`text-[13px] font-semibold ${c.tone}`}>{c.title}</h3>
          {c.items.length ? (
            <ul className="list-disc pl-4 m-0 mt-2.5 flex flex-col gap-1.5 text-[13.5px] text-ink-2 leading-[1.55]">
              {c.items.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3 mt-2.5">{c.empty}</p>
          )}
        </div>
      ))}
    </div>
  );
}
