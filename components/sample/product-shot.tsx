import Avatar from "@/components/app/avatar";
import { LaunchBars } from "@/components/app/charts";
import Brand from "@/components/brand";
import { IconBriefing, IconRefresh, IconSettings } from "@/components/icons";

import SampleCreative from "./creative";
import { SAMPLE_ADS, SAMPLE_RIVALS } from "./market";

/**
 * The product as the landing page shows it: the Briefing screen in a browser
 * window, drawn from the same components as the app with the invented market.
 */
export default function ProductShot() {
  const [clearwell, tidewell, marlow, fenn] = SAMPLE_ADS;
  const activity = [
    { ad: tidewell, label: "New", cls: "badge badge-pos", when: "2h" },
    { ad: fenn, label: "Proven", cls: "badge badge-warn", when: "5h" },
    { ad: clearwell, label: "New", cls: "badge badge-pos", when: "1d" },
    { ad: marlow, label: "Stopped", cls: "badge badge-neg", when: "1d" },
  ];
  return (
    <div className="rounded-[14px] border border-line-strong bg-bg shadow-[var(--shadow-lg)] overflow-hidden text-left select-none" aria-hidden="true">
      <div className="h-10 flex items-center gap-2 px-4 border-b border-line bg-subtle">
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="mx-auto h-6 px-3 rounded-md bg-bg border border-line text-[11.5px] text-ink-3 inline-flex items-center">app.usetrnd.com/briefing</span>
      </div>
      <div className="grid md:grid-cols-[200px_minmax(0,1fr)] min-h-[520px]">
        <aside className="hidden md:flex flex-col gap-5 border-r border-line bg-subtle p-3">
          <div className="px-2 pt-1">
            <Brand href={null} size={13} />
          </div>
          <div className="flex items-center gap-2 px-2">
            <Avatar name="Halo" size={22} />
            <span className="text-[12.5px] font-semibold">Halo</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="nav-item !h-7 !text-[12.5px]" aria-current="page">
              <IconBriefing /> Briefing
            </span>
            <span className="nav-item !h-7 !text-[12.5px]">
              <IconSettings /> Rivals &amp; settings
            </span>
          </div>
          <div>
            <div className="px-2.5 mb-1 text-[11px] text-ink-3">Rivals</div>
            {SAMPLE_RIVALS.map((r) => (
              <span key={r.name} className="nav-item !h-7 !text-[12.5px]">
                <Avatar name={r.name} size={16} />
                <span className="flex-1">{r.name}</span>
                <span className="text-[11px] text-ink-3 tnum">{r.live}</span>
              </span>
            ))}
          </div>
        </aside>

        <div className="p-5 sm:p-6 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="heading text-[16px]">Briefing</div>
              <div className="text-[11.5px] text-ink-3">4 rivals watched · last scan 2h ago</div>
            </div>
            <span className="btn btn-secondary btn-sm pointer-events-none">
              <IconRefresh /> Scan now
            </span>
          </div>

          <div className="card mt-4 p-4">
            <span className="badge !h-5 !text-[11px]">Since the last scan</span>
            <div className="heading text-[15px] leading-[1.35] mt-2">
              Tidewell launched a 3-for-$79 refill bundle: the same price as your filter, aimed at your subscription.
            </div>
            <p className="text-[12px] text-ink-2 leading-[1.6] mt-1.5 hidden sm:block">
              The ads that keep running open on a problem (breakage, dry skin), not the product. Fenn&apos;s statement ad just passed 128 days, and Marlow
              stopped two promos.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ["Live ads", "37", ""],
              ["New ads", "6", "text-pos"],
              ["Stopped ads", "3", "text-neg"],
              ["Newly proven", "1", "text-warn"],
            ].map(([l, v, c]) => (
              <div key={l} className="card px-3 py-2.5">
                <div className="text-[11px] text-ink-2">{l}</div>
                <div className={`text-[18px] font-semibold tnum ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="card overflow-hidden">
              <table className="table !text-[12px]">
                <thead>
                  <tr>
                    <th className="!py-2 !px-3">Rival</th>
                    <th className="!py-2 !px-3 !text-right">Live</th>
                    <th className="!py-2 !px-3 !text-right">New</th>
                    <th className="!py-2 !px-3 hidden sm:table-cell">Launches</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_RIVALS.map((r) => (
                    <tr key={r.name}>
                      <td className="!py-2 !px-3">
                        <span className="flex items-center gap-2 font-medium">
                          <Avatar name={r.name} size={18} />
                          {r.name}
                        </span>
                      </td>
                      <td className="!py-2 !px-3 text-right tnum">{r.live}</td>
                      <td className={`!py-2 !px-3 text-right tnum ${r.new7 ? "text-pos font-medium" : "text-ink-3"}`}>{r.new7}</td>
                      <td className="!py-2 !px-3 hidden sm:table-cell">
                        <LaunchBars counts={r.cadence} height={18} width={84} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card divide-y divide-line">
              {activity.map(({ ad, label, cls, when }, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <div className="w-8 h-8 rounded overflow-hidden border border-line shrink-0">
                    <SampleCreative spec={ad.creative} id={`shot-${i}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold">{ad.rival}</span>
                      <span className={`${cls} !h-[18px] !px-1.5 !text-[10.5px]`}>{label}</span>
                      <span className="ml-auto text-[10.5px] text-ink-3">{when}</span>
                    </div>
                    <div className="text-[11px] text-ink-2 truncate">{ad.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
