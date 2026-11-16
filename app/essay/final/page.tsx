import Link from "next/link";
import { notFound } from "next/navigation";

import FinalRead, { type SchoolOption } from "@/components/essayodds/final-read";
import PlanCards, { Agree } from "@/components/essayodds/plan-cards";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { paidSession } from "@/lib/essayodds/access";
import { PROMPTS, wordLimit } from "@/lib/essayodds/prompts";
import { SCHOOLS } from "@/lib/essayodds/schools";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "Final Read · EssayOdds" };

/** Every essay and list for the schools a student is applying to, checked in one pass before they submit. Paid. */
export default async function FinalReadPage() {
  if (!isEssayOpen) notFound();
  const session = await paidSession();
  const schools: SchoolOption[] = SCHOOLS.filter((s) => PROMPTS[s.id]?.prompts.length)
    .map((s) => ({ id: s.id, name: s.name, prompts: PROMPTS[s.id].prompts.map((p) => ({ title: p.title, text: p.text, limit: wordLimit(p), required: p.required })) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ground">
        <div className="flex items-center justify-between h-14 px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Brand />
            <span className="hidden sm:block h-4 w-px bg-line-strong" />
            <span className="hidden sm:block text-[13px] text-ink-2">Final Read</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/essay" className="btn btn-ghost btn-sm">
              Essays
            </Link>
            <Link href="/activities" className="btn btn-ghost btn-sm">
              Activities
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 bg-subtle">
        <div className="wrap py-12 sm:py-16">
          <p className="kicker">Final Read</p>
          <h1 className="section-title text-[32px] sm:text-[40px] mt-3 max-w-[720px]">Everything you&apos;re submitting, checked once.</h1>
          <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[640px]">Every essay and list, scored the same way as in your workspace, against the limit for its prompt. You see what is ready and the one fix left on each piece that isn&apos;t.</p>
          <div className="mt-10">
            {session ? (
              <FinalRead schools={schools} />
            ) : (
              <>
                <PlanCards />
                <Agree />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
