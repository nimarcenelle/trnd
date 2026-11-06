import Link from "next/link";
import { notFound } from "next/navigation";

import CopyBrief from "@/components/app/copy-brief";
import { markPostedAction } from "@/lib/creator/actions";
import { funnel } from "@/lib/creator/funnel";
import { getTeardown, listEvents } from "@/lib/creator/store";
import { teardownText } from "@/lib/creator/teardown";
import { env } from "@/lib/env";
import { compact, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

const TIER: Record<string, React.ReactNode> = {
  breakout: <span className="badge badge-pos">Broke out</span>,
  typical: <span className="badge badge-outline">Usual</span>,
  stalled: <span className="badge badge-neg">Stalled</span>,
};

/** One teardown: the script to record, the posts to screen-record, and what it has driven so far. */
export default async function TeardownPage({ params }: PageProps<"/studio/teardowns/[id]">) {
  const { id } = await params;
  const t = await getTeardown(id);
  if (!t) notFound();
  const driven = funnel((await listEvents(90)).filter((e) => e.src === t.src));
  const link = `${env.siteUrl.replace(/^https?:\/\//, "")}/creators?src=${t.src}`;
  const s = t.stats;

  return (
    <div className="flex flex-col gap-10 max-w-[900px]">
      <div>
        <Link href="/studio" className="caption hover:text-ink">
          ← Studio
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="heading text-[22px]">@{t.handle}</h1>
          {t.posted_at ? <span className="badge badge-pos">Posted</span> : <span className="badge badge-outline">Draft</span>}
        </div>
        <p className="caption mt-1">
          {t.platform === "tiktok" ? "TikTok" : "Instagram"}
          {t.niche ? ` · ${t.niche}` : ""} · made {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · code{" "}
          <span className="font-mono">{t.src}</span>
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Link href={`/studio/record/${t.id}`} className="btn btn-primary btn-sm">
            Play as video
          </Link>
          <form action={markPostedAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="posted" value={t.posted_at ? "0" : "1"} />
            <button className="btn btn-secondary btn-sm">{t.posted_at ? "Mark as draft" : "Mark as posted"}</button>
          </form>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-[13px] text-ink-2">Checks driven</div>
          <div className="text-[26px] font-semibold tnum mt-1">{driven.checks}</div>
          <div className="caption">through {t.src}</div>
        </div>
        <div className="card p-4">
          <div className="text-[13px] text-ink-2">Start free</div>
          <div className="text-[26px] font-semibold tnum mt-1">{driven.upgrades}</div>
          <div className="caption">{percent(driven.upgradeRate, 0)} of those checks</div>
        </div>
        <div className="card p-4">
          <div className="text-[13px] text-ink-2">Emails</div>
          <div className="text-[26px] font-semibold tnum mt-1">{driven.waitlist + driven.leads}</div>
          <div className="caption">{driven.waitlist} early access · {driven.leads} weekly re-check</div>
        </div>
      </section>

      <section>
        <h2 className="heading text-[17px]">Script</h2>
        <div className="card p-6 mt-4">
          <div className="caption">Hook, first two seconds</div>
          <blockquote className="m-0 mt-1.5 border-l-2 border-ink pl-3 text-[17px] font-semibold leading-[1.4]">{t.script.hook}</blockquote>
          <ol className="list-none p-0 m-0 mt-6 flex flex-col divide-y divide-line">
            {t.script.beats.map((b, i) => (
              <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] sm:grid-cols-[28px_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-4 gap-y-1 py-3.5">
                <span className="text-[13px] text-ink-3 tnum">{i + 1}</span>
                <p className="m-0 text-[14.5px] leading-[1.55]">{b.say}</p>
                <p className="m-0 text-[13px] text-ink-3 leading-[1.5] col-start-2 sm:col-start-3">{b.show}</p>
              </li>
            ))}
          </ol>
          <div className="well px-4 py-3 mt-2 text-[14.5px]">
            <span className="font-medium">Close: </span>
            {t.script.cta}
          </div>
          <dl className="m-0 mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 text-[13.5px] leading-[1.55]">
            <div>
              <dt className="text-ink-3 text-[12px]">Caption</dt>
              <dd className="m-0 mt-0.5 whitespace-pre-line">{t.script.caption}</dd>
            </div>
            <div>
              <dt className="text-ink-3 text-[12px]">Pinned comment</dt>
              <dd className="m-0 mt-0.5">{t.script.pinned_comment}</dd>
            </div>
            <div>
              <dt className="text-ink-3 text-[12px]">This video&apos;s link</dt>
              <dd className="m-0 mt-0.5 font-mono break-all">{link}</dd>
            </div>
          </dl>
          <CopyBrief text={teardownText(t.script)} label="Copy script" />
        </div>
      </section>

      <section>
        <h2 className="heading text-[17px]">The posts to screen-record</h2>
        <p className="text-[14px] text-ink-2 mt-1">
          Usual post: {compact(s.medianInteractions)} likes + comments + shares. {s.breakouts} broke out, {s.stalled} stalled, of {s.posts.length}.
        </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="text-left">Post</th>
                <th className="text-right">vs. usual</th>
                <th className="text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {s.posts.map((p, i) => (
                <tr key={p.url ?? i}>
                  <td className="max-w-[160px] sm:max-w-[480px]">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                        {p.caption ?? "No caption"}
                      </a>
                    ) : (
                      <div className="truncate">{p.caption ?? "No caption"}</div>
                    )}
                  </td>
                  <td className="text-right tnum">{p.multiple}×</td>
                  <td>{TIER[p.tier]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
