"use client";

import { useState } from "react";

import { IconArrowRight } from "@/components/icons";

/**
 * The hero's inline input: GPA, a test score and the schools. Odds are not live yet,
 * so submitting says so and points at the sample below instead of going anywhere.
 */
export default function OddsStart({ cta = "See my odds" }: { cta?: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="w-full max-w-[640px]">
      <form
        className="sitebox flex-col sm:flex-row !items-stretch sm:!items-center !gap-0 sm:!gap-1.5 !p-1.5 sm:!pl-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
      >
        <label className="flex flex-col justify-center px-3 py-1.5 sm:w-[92px] border-b sm:border-b-0 sm:border-r border-line text-left">
          <span className="text-[11px] text-ink-3">GPA</span>
          <input name="gpa" inputMode="decimal" placeholder="3.82" aria-label="GPA" className="!h-6 !text-[15px] tnum" required />
        </label>
        <label className="flex flex-col justify-center px-3 py-1.5 sm:w-[118px] border-b sm:border-b-0 sm:border-r border-line text-left">
          <span className="text-[11px] text-ink-3">SAT or ACT</span>
          <input name="test" inputMode="numeric" placeholder="1480" aria-label="SAT or ACT score" className="!h-6 !text-[15px] tnum" />
        </label>
        <label className="flex flex-col justify-center px-3 py-1.5 flex-1 min-w-0 text-left">
          <span className="text-[11px] text-ink-3">Schools</span>
          <input name="schools" placeholder="Up to 20, separated by commas" aria-label="Schools" className="!h-6 !text-[15px]" required />
        </label>
        <button className="btn btn-primary btn-lg mt-1.5 sm:mt-0" type="submit">
          {cta} <IconArrowRight />
        </button>
      </form>
      <p className="caption mt-3" role="status">
        {sent ? "Free odds open on [LAUNCH DATE]. Until then, the numbers below are a sample applicant." : "Free, no account: your odds, the locked/movable split and your top fix."}
      </p>
    </div>
  );
}
