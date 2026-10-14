import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import Avatar from "@/components/app/avatar";
import { YouVsThem } from "@/components/app/landscape";
import OpportunityCard, { OPPORTUNITY } from "@/components/app/opportunity-card";
import PreviewStart from "@/components/preview-start";
import SiteNav from "@/components/site-nav";
import { TRIAL_DAYS } from "@/lib/billing";
import { getPreview, type PreviewBody } from "@/lib/preview";

/** Opportunities shown in full; the rest are titles until the trial. */
const OPEN = 2;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export async function generateMetadata({ params }: PageProps<"/report/[id]">): Promise<Metadata> {
  const p = await getPreview((await params).id);
  const name = p?.body?.brand.name ?? p?.domain;
  // A report is shared by its link, never found by search.
  return { title: name ? `${name}: competitor report — TRND` : "Competitor report — TRND", robots: { index: false, follow: false } };
}

function Running({ stage, domain }: { stage: string | null; domain: string }) {
  return (
    <div className="max-w-[560px] mx-auto pt-20 sm:pt-28 text-center">
      <AutoRefresh every={4000} />
      <p className="kicker">Free report</p>
      <h1 className="display text-[30px] sm:text-[38px] mt-3">Reading {domain}&apos;s market</h1>
      <div className="card mt-8 px-5 py-4 flex items-center justify-center gap-3 text-[14px]">
        <span className="spinner" />
        {stage ?? "Starting"}…
      </div>
      <p className="caption mt-4 leading-[1.6]">
        Usually two to four minutes. This page updates on its own, and its link keeps working, so you can come back to it.
      </p>
    </div>
  );
}

function Failed({ error, domain }: { error: string | null; domain: string }) {
  return (
    <div className="max-w-[560px] mx-auto pt-20 sm:pt-28 text-center flex flex-col items-center">
      <h1 className="display text-[30px] sm:text-[36px]">We couldn&apos;t finish {domain}&apos;s report</h1>
      <p className="text-[15px] text-ink-2 leading-[1.6] mt-4">{error ?? "Something went wrong."} Try again, or check the address.</p>
      <div className="mt-8 w-full flex justify-center">
        <PreviewStart cta="Try again" site={domain} />
      </div>
    </div>
  );
}

function Upsell({ body, domain }: { body: PreviewBody; domain: string }) {
  const rivals = body.companies.filter((c) => !c.self).map((c) => c.name);
  return (
    <div className="card p-7 sm:p-9 mt-10 flex flex-col items-center text-center">
      <h2 className="heading text-[22px] max-w-[600px]">This is one read. Your competitors change their ads every week.</h2>
      <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-3 max-w-[620px]">
        TRND watches {rivals.slice(0, 3).join(", ")}
        {rivals.length > 3 ? " and the rest" : ""} every day: every ad they launch, stop or keep paying for, every change to their website and prices, every
        marketing email. When something moves, you get the move to make, with a campaign brief.
      </p>
      <Link href={`/signup?site=${encodeURIComponent(domain)}`} className="btn btn-primary btn-lg mt-7">
        Start {TRIAL_DAYS}-day free trial
      </Link>
      <p className="caption mt-3">Cancel before the trial ends and you pay nothing.</p>
    </div>
  );
}

export default async function ReportPage({ params }: PageProps<"/report/[id]">) {
  const p = await getPreview((await params).id);
  if (!p) notFound();

  if (p.status !== "done" || !p.body) {
    return (
      <div className="min-h-dvh flex flex-col">
        <SiteNav />
        <main className="wrap flex-1 pb-24">{p.status === "error" ? <Failed error={p.error} domain={p.domain} /> : <Running stage={p.stage} domain={p.domain} />}</main>
      </div>
    );
  }

  const { brand, companies, report } = p.body;
  const ads = new Map(p.body.ads.map((a) => [a.archive_id, a]));
  const ranked = [...report.opportunities.filter((o) => o.type !== "ignore"), ...report.opportunities.filter((o) => o.type === "ignore")];
  const open = ranked.slice(0, OPEN);
  const locked = ranked.slice(OPEN);
  const rivals = companies.filter((c) => !c.self);

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="wrap flex-1 pt-10 sm:pt-14 pb-24 max-w-[1040px]">
        <p className="caption">
          Free report · {fmtDate(p.created_at)} · {brand.url.replace(/^https?:\/\/(www\.)?/, "")}
        </p>
        <h1 className="display text-[30px] sm:text-[40px] mt-3">
          {brand.name} vs. {rivals.length} competitors
        </h1>
        <div className="card mt-6 p-6 sm:p-7">
          <h2 className="heading text-[20px] sm:text-[22px] leading-[1.3]">{report.headline}</h2>
          <p className="text-[14.5px] text-ink-2 leading-[1.7] mt-3">{report.summary}</p>
        </div>

        <section className="mt-10">
          <h2 className="heading text-[15px]">Who&apos;s advertising</h2>
          <p className="caption mt-1">Live Meta ads today, and how long the longest one has run. An ad that runs for months is one they keep paying for.</p>
          <div className="card mt-4 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="text-right">Live ads</th>
                  <th className="text-right">Longest running</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={c.name} size={22} />
                        <span className="font-medium">{c.self ? `${c.name} (you)` : c.name}</span>
                      </span>
                    </td>
                    {c.pageName ? (
                      <>
                        <td className="text-right tnum">{c.liveAds}</td>
                        <td className="text-right tnum">{c.liveAds ? `${c.longest} days` : "—"}</td>
                      </>
                    ) : (
                      <td colSpan={2} className="text-right text-ink-3">
                        Not running Meta ads right now
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="heading text-[15px]">Your next moves</h2>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 mt-4 md:grid-cols-2">
            {open.map((o) => (
              <OpportunityCard key={o.title} o={o} ads={ads} refs={new Map()} />
            ))}
          </div>
          {locked.length > 0 && (
            <div className="card mt-4 divide-y divide-line">
              {locked.map((o) => (
                <div key={o.title} className="px-5 py-3.5 flex items-center gap-3">
                  <span className={OPPORTUNITY[o.type].cls}>{OPPORTUNITY[o.type].label}</span>
                  <span className="text-[14px] font-medium min-w-0 truncate">{o.title}</span>
                </div>
              ))}
              <div className="px-5 py-4 bg-subtle rounded-b-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[13.5px] text-ink-2">
                  {locked.length} more move{locked.length === 1 ? "" : "s"}, with the evidence and a campaign brief for each, are in your trial.
                </span>
                <Link href={`/signup?site=${encodeURIComponent(p.domain)}`} className="btn btn-secondary btn-sm shrink-0">
                  See all {ranked.length}
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="heading text-[15px]">Where you stand</h2>
          <p className="text-[14px] text-ink-2 leading-[1.65] mt-2 mb-4">{report.landscape.summary}</p>
          <YouVsThem landscape={report.landscape} />
        </section>

        <Upsell body={p.body} domain={p.domain} />

        <p className="caption mt-8 leading-[1.6]">
          Read from public ad data on {fmtDate(p.created_at)}. Competitors don&apos;t publish their results, so this reads what they keep running
          and repeating, and says how confident it is. Anyone with this link can see this report.
        </p>
      </main>
    </div>
  );
}
