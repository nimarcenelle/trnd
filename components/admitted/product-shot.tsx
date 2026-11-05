"use client";

import { useState } from "react";

import Brand from "@/components/brand";
import { IconCalendar, IconEssay, IconList, IconOdds } from "@/components/icons";

import { APPLICANT, ESSAY, MOVES, SCHOOLS, type Band } from "./sample";
import { MovePill, SplitBar, SplitLegend } from "./split";

const TABS = [
  { key: "odds", label: "Odds", icon: IconOdds, path: "odds" },
  { key: "essays", label: "Essays", icon: IconEssay, path: "essays" },
  { key: "list", label: "College list", icon: IconList, path: "list" },
  { key: "deadlines", label: "Deadlines", icon: IconCalendar, path: "deadlines" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const BANDS: Band[] = ["High reach", "Reach"];

/**
 * The app shell as the landing page shows it, in a browser frame: side nav, the
 * selected view, and the ranked next moves. Sample applicant, real schools.
 */
export default function ProductShot() {
  const [tab, setTab] = useState<Tab>("odds");
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <div className="rounded-[14px] border border-line-strong bg-bg shadow-[var(--shadow-lg)] overflow-hidden text-left">
      <div className="h-10 flex items-center gap-2 px-4 border-b border-line bg-subtle">
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="mx-auto h-6 px-3 rounded-md bg-bg border border-line text-[12px] text-ink-3 inline-flex items-center">admitted.usetrnd.com/{current.path}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[184px_minmax(0,1fr)] lg:grid-cols-[184px_minmax(0,1fr)_260px] min-h-[540px]">
        <aside className="md:border-r border-b md:border-b-0 border-line bg-subtle p-3 flex md:flex-col gap-5">
          <div className="px-2 pt-1 hidden md:block">
            <Brand href={null} size={13} />
          </div>
          <div className="px-2 hidden md:block">
            <div className="text-[13px] font-semibold">{APPLICANT.label}</div>
            <div className="text-[11px] text-ink-3 tnum">
              GPA {APPLICANT.gpa} · {APPLICANT.test}
            </div>
          </div>
          <nav className="flex md:flex-col gap-0.5 overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0" aria-label="Sample app views">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className="nav-item !h-7 !text-[13px] shrink-0 border-0 bg-transparent cursor-pointer text-left font-[inherit]"
              >
                <Icon /> {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto hidden md:block px-2">
            <div className="text-[11px] text-ink-3">Track</div>
            <div className="text-[13px] font-medium mt-0.5">Undergrad · {APPLICANT.cycle}</div>
          </div>
        </aside>

        <div className="p-5 sm:p-6 min-w-0">
          {tab === "odds" && <OddsView />}
          {tab === "essays" && <EssaysView />}
          {tab === "list" && <ListView />}
          {tab === "deadlines" && <DeadlinesView />}
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-line p-4 min-w-0">
          <div className="flex items-baseline justify-between">
            <div className="heading text-[14px]">Next moves</div>
            <span className="text-[11px] text-ink-3">by points gained</span>
          </div>
          <ol className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
            {MOVES.map((m) => (
              <li key={m.rank} className="card p-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-[11px] text-ink-3 tnum mt-[2px]">{m.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-snug">{m.title}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <MovePill move={m} className="!h-5 !text-[11px]" />
                      <span className="text-[11px] text-ink-3 tnum text-right">
                        <span className="text-[13px] font-semibold text-brand">{m.gain}</span> pts {m.where}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function ViewHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="heading text-[16px]">{title}</div>
        <div className="text-[12px] text-ink-3 tnum">{sub}</div>
      </div>
      {right}
    </div>
  );
}

function OddsView() {
  return (
    <>
      <ViewHeader title="Odds" sub={`${SCHOOLS.length} schools · from each school's Common Data Set`} right={<span className="hidden sm:block"><SplitLegend /></span>} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Locked", `${APPLICANT.locked}%`, "text-ink", "set by GPA and scores"],
          ["Movable", `${APPLICANT.movable}%`, "text-brand", "your application decides"],
          ["Top fix", "+10 pts", "text-ink", "Add Cornell, apply RD"],
        ].map(([l, v, c, cap]) => (
          <div key={l} className="card px-3 py-2.5">
            <div className="text-[11px] text-ink-2">{l}</div>
            <div className={`text-[18px] font-semibold tnum tracking-tight ${c}`}>{v}</div>
            <div className="text-[11px] text-ink-3 truncate">{cap}</div>
          </div>
        ))}
      </div>
      <div className="card mt-3 overflow-hidden">
        <table className="table !text-[13px]">
          <thead>
            <tr>
              <th className="!py-2 !px-3">School</th>
              <th className="!py-2 !px-3 text-right">Odds</th>
              <th className="!py-2 !px-3 hidden sm:table-cell w-[34%]">Locked · movable</th>
              <th className="!py-2 !px-3 text-right">With fixes</th>
            </tr>
          </thead>
          <tbody>
            {SCHOOLS.map((s) => (
              <tr key={s.name}>
                <td className="!py-2.5 !px-3">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-[11px] text-ink-3">{s.band}</div>
                </td>
                <td className="!py-2.5 !px-3 text-right tnum font-semibold">{s.odds}%</td>
                <td className="!py-2.5 !px-3 hidden sm:table-cell">
                  <SplitBar locked={s.locked} movable={s.movable} />
                  <div className="text-[11px] text-ink-3 tnum mt-1">
                    {s.locked} · {s.movable}
                  </div>
                </td>
                <td className="!py-2.5 !px-3 text-right tnum">
                  <span className="text-brand font-semibold">{s.withFixes}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EssaysView() {
  return (
    <>
      <ViewHeader title="Essays" sub={`${ESSAY.prompt} · revision ${ESSAY.revision}`} right={<span className="badge badge-pos !h-5 !text-[11px]">Draft ready</span>} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="well p-3.5">
          <div className="text-[11px] text-ink-3">Your draft</div>
          <p className="text-[13px] text-ink-2 leading-[1.65] mt-1.5">{ESSAY.draft}</p>
        </div>
        <div className="card p-3.5">
          <div className="text-[11px] text-ink-3">Rewrite</div>
          <p className="text-[13px] leading-[1.65] mt-1.5">{ESSAY.rewrite}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Words", ESSAY.words],
          ["Your sentences kept", `${ESSAY.kept}%`],
          ["Points gained", "+1 at Dartmouth"],
        ].map(([l, v]) => (
          <div key={l} className="card px-3 py-2.5">
            <div className="text-[11px] text-ink-2">{l}</div>
            <div className="text-[14px] font-semibold tnum mt-0.5">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 card divide-y divide-line">
        {[
          ["Why Dartmouth", "Draft ready", "badge badge-pos"],
          ["Yale: short answers", "Revision 2", "badge badge-outline"],
          ["Harvard: supplement", "Not started", "badge badge-outline"],
        ].map(([t, s, c]) => (
          <div key={t} className="flex items-center justify-between px-3 py-2 text-[13px]">
            <span className="font-medium">{t}</span>
            <span className={`${c} !h-5 !text-[11px]`}>{s}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ListView() {
  return (
    <>
      <ViewHeader title="College list" sub="Rebalanced: Cornell added" />
      <div className="mt-4 card px-3.5 py-3 flex items-baseline justify-between gap-3">
        <div className="text-[12px] text-ink-2">Chance of at least one admit</div>
        <div className="tnum text-[13px]">
          <span className="text-ink-3">19%</span> → <span className="font-semibold text-brand text-[16px]">29%</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {BANDS.map((b) => (
          <div key={b} className="card p-3">
            <div className="text-[11px] text-ink-3">{b}</div>
            <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-2">
              {SCHOOLS.filter((s) => s.band === b).map((s) => (
                <li key={s.name} className="text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="tnum text-ink-2">{s.odds}%</span>
                  </div>
                  {s.name === "Cornell University" && <span className="badge badge-pos !h-[18px] !px-1.5 !text-[11px] mt-1">Added</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-ink-3 mt-3 leading-[1.55]">Two high reaches, two reaches. Cornell admits 8.4% of first-year applicants, the highest rate on this list.</p>
    </>
  );
}

function DeadlinesView() {
  return (
    <>
      <ViewHeader title="Deadlines" sub="One binding round: ED to Dartmouth" />
      <div className="card mt-4 overflow-hidden">
        <table className="table !text-[13px]">
          <thead>
            <tr>
              <th className="!py-2 !px-3">School</th>
              <th className="!py-2 !px-3">Round</th>
              <th className="!py-2 !px-3 text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {[...SCHOOLS]
              .sort((a, b) => order(a.due) - order(b.due))
              .map((s) => (
                <tr key={s.name}>
                  <td className="!py-2.5 !px-3 font-medium">{s.name}</td>
                  <td className="!py-2.5 !px-3">
                    <span className={`badge !h-5 !text-[11px] ${s.plan === "ED" ? "badge-warn" : "badge-outline"}`}>{s.plan}</span>
                  </td>
                  <td className="!py-2.5 !px-3 text-right tnum text-ink-2">{s.due}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ink-3 mt-3 leading-[1.55]">Dartmouth admitted 21.6% of its early decision applicants, against 6.0% of all applicants. If Dartmouth admits you, the other applications are withdrawn.</p>
    </>
  );
}

/** Sort key for the sample deadlines: month then day, rolling last. */
function order(due: string) {
  const m = { Nov: 0, Dec: 1, Jan: 2 }[due.slice(0, 3)];
  return m === undefined ? 99 : m * 40 + Number(due.slice(4));
}
