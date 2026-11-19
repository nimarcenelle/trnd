import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuyButton } from "@/components/essayodds/plan-cards";
import SiteNav from "@/components/site-nav";
import { daysUntil } from "@/lib/essayodds/deadline";
import { PASS_ENDS, PLANS } from "@/lib/essayodds/plans";
import { shortName } from "@/lib/essayodds/list";
import { COMMON_APP, PROMPTS, type Prompt, wordLimit } from "@/lib/essayodds/prompts";
import { admitRate, earlyRate, SCHOOLS } from "@/lib/essayodds/schools";

export const dynamicParams = false;
/** The deadline countdown is worked out on the server, so these pages rebuild hourly. */
export const revalidate = 3600;
export const generateStaticParams = () => SCHOOLS.filter((s) => PROMPTS[s.id]).map((s) => ({ school: s.id }));

export async function generateMetadata({ params }: PageProps<"/essays/[school]">): Promise<Metadata> {
  const { school } = await params;
  const s = SCHOOLS.find((x) => x.id === school);
  if (!s || !PROMPTS[s.id]) return {};
  const name = shortName(s.name);
  return { title: `${name} essay prompts ${PROMPTS[s.id].cycle} · EssayOdds`, description: `Every ${name} supplemental essay prompt for ${PROMPTS[s.id].cycle}, with word limits. Paste your answer and get it scored.` };
}

const limitLabel = (p: Prompt) => (p.limit === null ? "No stated limit" : `${p.limit.toLocaleString()} ${p.unit} max`);

function PromptRow({ prompt, href }: { prompt: Prompt; href: string }) {
  return (
    <li className="card p-5 sm:p-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold">{prompt.title}</h3>
          <span className="text-[12px] text-ink-3 tnum">{limitLabel(prompt)}</span>
          {!prompt.required && <span className="badge badge-outline">Optional</span>}
        </div>
        <p className="text-[14px] text-ink-2 leading-[1.65] mt-2">{prompt.text}</p>
      </div>
      {(wordLimit(prompt) ?? 650) > 60 ? (
        <Link href={href} className="btn btn-secondary shrink-0">
          Review my answer
        </Link>
      ) : (
        <span className="text-[12px] text-ink-3 shrink-0 sm:pt-2">Too short to review</span>
      )}
    </li>
  );
}

export default async function SchoolPromptsPage({ params }: PageProps<"/essays/[school]">) {
  const { school } = await params;
  const s = SCHOOLS.find((x) => x.id === school);
  const data = s ? PROMPTS[s.id] : undefined;
  if (!s || !data) notFound();
  const name = shortName(s.name);
  const early = earlyRate(s);
  const due = daysUntil(s.regularDeadline);
  const facts = [
    { label: "Admit rate", value: `${admitRate(s).toFixed(1)}%` },
    s.early && early ? { label: `${s.early.plan} admit rate`, value: `${early.toFixed(1)}%` } : null,
    s.early?.closes ? { label: `${s.early.plan} deadline`, value: s.early.closes } : null,
    s.regularDeadline ? { label: "Regular deadline", value: s.regularDeadline } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="wash-top">
          <div className="wrap py-14 sm:py-20 max-w-[920px]">
            <p className="text-[13px] text-ink-3">
              <Link href="/essays" className="hover:text-ink">
                Essay prompts
              </Link>{" "}
              / {name}
            </p>
            <h1 className="section-title text-[32px] sm:text-[40px] mt-3">{name} essay prompts, {data.cycle}</h1>
            <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[680px]">
              {data.prompts.length
                ? `Every prompt ${s.name} asks first-year applicants this cycle, with its limit. Paste your answer into the workspace and our AI scores it against six criteria and marks the lines working against you most.`
                : `${s.name} asks for no supplemental essays this cycle. Your Common App personal statement carries the writing, so it is the one to get right.`}
            </p>
            <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-[760px]">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-[12px] text-ink-3">{f.label}</dt>
                  <dd className="text-[20px] font-semibold tnum mt-1">{f.value}</dd>
                </div>
              ))}
            </dl>
            <p className="caption mt-3">
              From {name}&apos;s {s.edition} Common Data Set.{" "}
              <Link href="/odds" className="underline hover:text-ink">
                See your odds at {name}
              </Link>
            </p>
            <div className="card mt-8 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[var(--shadow-lg)]">
              <div>
                {due !== null && <p className="text-[13px] font-semibold text-[var(--warn)] tnum">{due === 0 ? `${name}'s regular deadline is today` : `${due} day${due === 1 ? "" : "s"} until ${name}'s regular deadline`}</p>}
                <p className="text-[17px] font-semibold mt-1">Get every {name} essay scored and fixed before you submit.</p>
                <p className="text-[13px] text-ink-2 mt-1">Your score, the lines working against you, rewrites in your voice. {PLANS.rd.price} once through {PASS_ENDS}, or {PLANS.week.short}.</p>
              </div>
              <div className="sm:w-[220px] shrink-0">
                <BuyButton plan={PLANS.rd} primary agree />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-subtle">
          <div className="wrap py-12 sm:py-16 max-w-[920px]">
            {data.note && <p className="well px-4 py-3 text-[14px] text-ink-2 mb-6">{data.note}</p>}
            <ol className="list-none p-0 m-0 flex flex-col gap-3">
              <PromptRow prompt={COMMON_APP} href="/essay" />
              {data.prompts.map((p, i) => (
                <PromptRow key={p.title + i} prompt={p} href={`/essay?school=${s.id}&p=${i}`} />
              ))}
            </ol>
            <p className="caption mt-6">
              Prompts copied from{" "}
              <a className="underline hover:text-ink" href={data.source} rel="noopener noreferrer" target="_blank">
                the published source
              </a>
              . Schools can change them during the cycle, so check {name}&apos;s admissions site before you submit.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
