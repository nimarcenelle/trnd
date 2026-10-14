import Avatar from "@/components/app/avatar";
import Brand from "@/components/brand";
import { IconBriefing, IconRefresh, IconSettings, IconTimeline } from "@/components/icons";

import SampleCreative from "./creative";
import { SAMPLE_ADS, SAMPLE_RIVALS } from "./market";

/**
 * The product as the landing page shows it: the Briefing screen in a browser
 * window, drawn from the same components as the app with the invented market.
 */
export default function ProductShot() {
  const [, tidewell, , fenn] = SAMPLE_ADS;
  const activity = [
    { rival: "Tidewell", icon: <SampleCreative spec={tidewell.creative} id="shot-0" />, label: "New ad", cls: "badge badge-pos", when: "2h", line: tidewell.title },
    { rival: "Tidewell", icon: <Avatar name="Tidewell" size={20} />, label: "New offer", cls: "badge badge-warn", when: "5h", line: "A year of clean water for $79" },
    { rival: "Tidewell", icon: <Avatar name="Tidewell" size={20} />, label: "New message", cls: "badge badge-info", when: "1d", line: "“Clean water, half the price”" },
    { rival: "Fenn", icon: <SampleCreative spec={fenn.creative} id="shot-1" />, label: "Proven ad", cls: "badge badge-warn", when: "1d", line: fenn.title },
    { rival: "Clearwell", icon: <Avatar name="Clearwell" size={20} />, label: "Sale", cls: "badge badge-warn", when: "2d", line: "Showerhead $135 → $108" },
  ];
  const moves = [
    { label: "Counter", cls: "badge badge-warn", title: "Answer Tidewell's price push with cost per month, not a discount", hook: "Cheaper filters, twice the refills. Do the math." },
    { label: "Get ahead", cls: "badge badge-pos", title: "Own before/after for skin before Fenn gets there", hook: "Day 1 vs day 21. Same moisturizer. Different water." },
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
              <IconTimeline /> Timeline
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
              Tidewell is selling hard on price. Answer with cost per month, not a discount.
            </div>
            <p className="text-[12px] text-ink-2 leading-[1.6] mt-1.5 hidden sm:block">
              It goes straight at your refill subscription. Matching $79 breaks your margin; your cartridge lasting twice as long doesn&apos;t.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ["Live ads", "37", ""],
              ["New moves", "9", "text-pos"],
              ["New offers", "5", "text-warn"],
              ["Price changes", "2", ""],
            ].map(([l, v, c]) => (
              <div key={l} className="card px-3 py-2.5">
                <div className="text-[11px] text-ink-2">{l}</div>
                <div className={`text-[18px] font-semibold tnum ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2">
              {moves.map((m) => (
                <div key={m.title} className="card p-3.5">
                  <span className={`${m.cls} !h-5 !text-[11px]`}>{m.label}</span>
                  <div className="text-[13px] font-semibold leading-snug mt-2">{m.title}</div>
                  <div className="mt-2 border-l-2 border-ink pl-2.5 text-[12px] font-medium leading-[1.45]">&ldquo;{m.hook}&rdquo;</div>
                </div>
              ))}
            </div>
            <div className="card divide-y divide-line">
              {activity.map(({ rival, icon, label, cls, when, line }, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <div className="w-8 h-8 rounded overflow-hidden border border-line shrink-0 grid place-items-center bg-subtle text-ink-2">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold">{rival}</span>
                      <span className={`${cls} !h-[18px] !px-1.5 !text-[10.5px]`}>{label}</span>
                      <span className="ml-auto text-[10.5px] text-ink-3">{when}</span>
                    </div>
                    <div className="text-[11px] text-ink-2 truncate">{line}</div>
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
