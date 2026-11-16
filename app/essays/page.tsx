import Link from "next/link";

import SiteNav from "@/components/site-nav";
import { shortName } from "@/lib/essayodds/list";
import { PROMPTS } from "@/lib/essayodds/prompts";
import { SCHOOLS } from "@/lib/essayodds/schools";

export const metadata = { title: "College essay prompts 2026–27 · EssayOdds", description: "Supplemental essay prompts and word limits for 39 colleges, from each school's own site. Paste an answer and get it scored." };

export default function EssayPromptsIndex() {
  const listed = SCHOOLS.filter((s) => PROMPTS[s.id]).sort((a, b) => shortName(a.name).localeCompare(shortName(b.name)));
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="wash-top">
          <div className="wrap py-14 sm:py-20">
            <p className="kicker">Essay prompts</p>
            <h1 className="section-title text-[32px] sm:text-[40px] mt-3 max-w-[720px]">Every prompt, every limit, for {listed.length} schools.</h1>
            <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[640px]">This cycle&apos;s supplemental essays, copied from each school&apos;s own site where it publishes them. Pick a prompt and get your answer scored, with every weak line marked.</p>
            <ul className="list-none p-0 m-0 mt-10 grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {listed.map((s) => {
                const n = PROMPTS[s.id].prompts.filter((p) => p.required).length;
                return (
                  <li key={s.id}>
                    <Link href={`/essays/${s.id}`} className="card p-5 flex items-baseline justify-between gap-3 hover:bg-subtle transition-colors">
                      <span className="text-[14px] font-medium">{shortName(s.name)}</span>
                      <span className="text-[13px] text-ink-3 tnum shrink-0">{PROMPTS[s.id].prompts.length ? `${n} required, ${PROMPTS[s.id].prompts.length} in all` : "No supplement"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
