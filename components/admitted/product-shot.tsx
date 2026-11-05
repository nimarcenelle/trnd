"use client";

import { useState } from "react";

import Brand from "@/components/brand";
import { IconEssay, IconOdds } from "@/components/icons";
import { atLeastOne } from "@/lib/admitted/list";

import EssaySample from "./essay-sample";
import OddsTable from "./odds-table";
import { APPLICANT, SCHOOLS } from "./sample";

const TABS = [
  { key: "odds", label: "Odds", icon: IconOdds, path: "" },
  { key: "essays", label: "Essays", icon: IconEssay, path: "essay" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const avgMovable = Math.round(SCHOOLS.reduce((sum, s) => sum + s.movable, 0) / SCHOOLS.length);

/** The product in a browser frame, for a sample applicant on a real list. */
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
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[184px_minmax(0,1fr)] md:min-h-[470px]">
        <aside className="md:border-r border-b md:border-b-0 border-line bg-subtle p-3 flex md:flex-col gap-5">
          <div className="px-2 pt-1 hidden md:block">
            <Brand href={null} size={13} />
          </div>
          <div className="px-2 hidden md:block">
            <div className="text-[13px] font-semibold">{APPLICANT.label}</div>
            <div className="text-[12px] text-ink-3 tnum">
              GPA {APPLICANT.gpa} · {APPLICANT.test}
            </div>
          </div>
          <nav className="flex md:flex-col gap-0.5" aria-label="Sample views">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined} className="nav-item !h-7 !text-[13px] shrink-0 border-0 bg-transparent cursor-pointer text-left font-[inherit]">
                <Icon /> {label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="p-5 sm:p-6 min-w-0">
          {tab === "odds" ? (
            <OddsTable rows={SCHOOLS.map((s) => ({ ...s, key: s.name }))} list={atLeastOne(SCHOOLS.map((s) => s.odds))} avgMovable={avgMovable} />
          ) : (
            <div className="flex justify-center md:pt-4">
              <EssaySample />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
