"use client";

import { useState } from "react";

import Brand from "@/components/brand";
import { IconEssay, IconOdds } from "@/components/icons";

import EssaySample from "./essay-sample";
import OddsTable from "./odds-table";
import { APPLICANTS } from "./sample";

const TABS = [
  { key: "odds", label: "Odds", icon: IconOdds, path: "" },
  { key: "essays", label: "Essays", icon: IconEssay, path: "essay" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** The product in a browser frame, for two sample applicants on real lists. */
export default function ProductShot() {
  const [tab, setTab] = useState<Tab>("odds");
  const [who, setWho] = useState(APPLICANTS[0].key);
  const applicant = APPLICANTS.find((a) => a.key === who)!;
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <div className="rounded-[14px] border border-line-strong bg-bg shadow-[var(--shadow-lg)] overflow-hidden text-left">
      <div className="h-10 flex items-center gap-2 px-4 border-b border-line bg-subtle">
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
        <span className="mx-auto h-6 px-3 rounded-md bg-bg border border-line text-[12px] text-ink-3 inline-flex items-center">admitted.usetrnd.com/{current.path}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[200px_minmax(0,1fr)] md:min-h-[430px]">
        <aside className="md:border-r border-b md:border-b-0 border-line bg-subtle p-3 flex md:flex-col gap-5">
          <div className="px-2 pt-1 hidden md:block">
            <Brand href={null} size={13} />
          </div>
          <nav className="flex md:flex-col gap-0.5" aria-label="Sample views">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined} className="nav-item !h-7 !text-[13px] shrink-0 border-0 bg-transparent cursor-pointer text-left font-[inherit]">
                <Icon /> {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto md:ml-0 md:mt-auto flex md:flex-col gap-1 min-w-0">
            <div className="text-[12px] text-ink-3 px-2 hidden md:block">Sample applicant</div>
            {APPLICANTS.map((a) => (
              <button key={a.key} type="button" aria-pressed={who === a.key} onClick={() => setWho(a.key)} className={`px-2 py-1.5 rounded-[7px] text-left text-[12px] tnum cursor-pointer border-0 font-[inherit] ${who === a.key ? "bg-[var(--soft)] text-ink font-medium" : "bg-transparent text-ink-2 hover:bg-muted"}`}>
                {a.gpa} · {a.test}
              </button>
            ))}
          </div>
        </aside>
        <div className="p-5 sm:p-6 min-w-0">
          {tab === "odds" ? (
            <OddsTable rows={applicant.schools.map((s) => ({ ...s, key: s.name }))} />
          ) : (
            <div className="flex justify-center md:pt-2">
              <EssaySample />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
