import Link from "next/link";

import TeardownForm from "@/components/creator/teardown-form";
import { BUILD_AT, DECIDE_AFTER, funnel, REWORK_BELOW, verdict, within, type Verdict } from "@/lib/creator/funnel";
import { listEvents, listTeardowns } from "@/lib/creator/store";
import { env } from "@/lib/env";
import { percent } from "@/lib/format";

export const dynamic = "force-dynamic";
// A teardown reads a profile and writes a script: a minute or two.
export const maxDuration = 300;

const VERDICT: Record<Verdict, { badge: string; label: string; say: (rate: string, checks: number) => string }> = {
  collecting: {
    badge: "badge badge-outline",
    label: "Collecting",
    say: (_r, n) => `${n} of ${DECIDE_AFTER} checks. Keep posting teardowns; the call is made at ${DECIDE_AFTER}, not before.`,
  },
  build: {
    badge: "badge badge-pos",
    label: "Build it",
    say: (r) => `${r} of checks clicked Start free, over the ${percent(BUILD_AT, 0)} bar. People want the plan: build the creator onboarding and the Stripe price.`,
  },
  rework: {
    badge: "badge badge-neg",
    label: "Change the offer",
    say: (r) => `${r} of checks clicked Start free, under ${percent(REWORK_BELOW, 0)}. Change the price, the promise or what stays free before writing more code.`,
  },
  keep_testing: {
    badge: "badge badge-warn",
    label: "Keep testing",
    say: (r) => `${r} of checks clicked Start free: interest, not yet enough. Change one thing on the upgrade card at a time and watch this number.`,
  },
};

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="text-[26px] font-semibold tracking-[-0.02em] tnum mt-1">{value}</div>
      <div className="caption mt-0.5">{note}</div>
    </div>
  );
}

export default async function StudioPage() {
  const [events, teardowns] = await Promise.all([listEvents(90), listTeardowns(30)]);
  const month = funnel(within(events, 30));
  const week = funnel(within(events, 7));
  const all = funnel(events);
  const v = verdict(all);
  const site = env.siteUrl.replace(/^https?:\/\//, "");
  const bySrc = new Map(all.bySource.map((s) => [s.src, s]));

  return (
    <div className="flex flex-col gap-12">
      <section>
        <h1 className="heading text-[22px]">Is it working?</h1>
        <div className="card p-5 mt-4">
          <div className="flex items-center gap-2.5">
            <span className={VERDICT[v].badge}>{VERDICT[v].label}</span>
            <span className="caption">Last 90 days · {all.checks} checks · {all.upgrades} Start free clicks · {all.waitlist} early-access emails</span>
          </div>
          <p className="text-[15px] leading-[1.6] mt-3 max-w-[760px]">{VERDICT[v].say(percent(all.upgradeRate, 1), all.checks)}</p>
          <p className="caption mt-2">
            The rule, set before the numbers: at {DECIDE_AFTER} checks, {percent(BUILD_AT, 0)} or more clicking Start free means build; under {percent(REWORK_BELOW, 0)} means
            change the offer. Edit it in <code>lib/creator/funnel.ts</code>.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <Kpi label="Checks" value={String(month.checks)} note={`30 days · ${week.checks} this week`} />
          <Kpi label="Creators" value={String(month.creators)} note="different handles checked" />
          <Kpi label="Start free" value={percent(month.upgradeRate, 1)} note={`${month.upgrades} clicks from ${month.checks} checks, 30 days`} />
          <Kpi label="Early access" value={percent(month.upgrades ? month.waitlist / month.upgrades : null, 0)} note={`${month.waitlist} of ${month.upgrades} who clicked left an email`} />
          <Kpi label="Weekly re-check" value={percent(month.leadRate, 1)} note={`${month.leads} emails from ${month.checks} checks, 30 days`} />
          <Kpi label="Failed checks" value={String(month.failed)} note="handle not found, private or a read that broke" />
        </div>
      </section>

      <section>
        <h2 className="heading text-[17px]">Make a teardown</h2>
        <p className="text-[14px] text-ink-2 mt-1 mb-4 max-w-[720px]">
          A public creator in a niche you want to reach. The check runs on their last 12 posts and a 30-45 second faceless script is written from it, with its own
          link code so the checks it drives are counted to it.
        </p>
        <TeardownForm />
      </section>

      <section>
        <h2 className="heading text-[17px]">Teardowns</h2>
        {teardowns.length ? (
          <div className="card mt-4 overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="text-left">Creator</th>
                  <th className="text-left">Hook</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Checks</th>
                  <th className="text-right">Start free</th>
                </tr>
              </thead>
              <tbody>
                {teardowns.map((t) => {
                  const s = bySrc.get(t.src);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/studio/teardowns/${t.id}`} className="font-medium hover:underline">
                          @{t.handle}
                        </Link>
                        <div className="caption">
                          {t.platform === "tiktok" ? "TikTok" : "Instagram"} · {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      </td>
                      <td className="max-w-[360px]">
                        <div className="truncate">{t.script.hook}</div>
                      </td>
                      <td>{t.posted_at ? <span className="badge badge-pos">Posted</span> : <span className="badge badge-outline">Draft</span>}</td>
                      <td className="text-right tnum">{s?.checks ?? 0}</td>
                      <td className="text-right tnum">{s?.upgrades ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[14px] text-ink-3 mt-3">None yet. Make the first one above.</p>
        )}
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-6">
        <div>
          <h2 className="heading text-[17px]">Where checks come from</h2>
          {all.bySource.length ? (
            <div className="card mt-4 overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Source</th>
                    <th className="text-right">Checks</th>
                    <th className="text-right">Start free</th>
                    <th className="text-right">Early access</th>
                    <th className="text-right">Re-check</th>
                  </tr>
                </thead>
                <tbody>
                  {all.bySource.map((s) => (
                    <tr key={s.src}>
                      <td className="font-mono text-[12.5px]">{s.src}</td>
                      <td className="text-right tnum">{s.checks}</td>
                      <td className="text-right tnum">{s.upgrades}</td>
                      <td className="text-right tnum">{s.waitlist}</td>
                      <td className="text-right tnum">{s.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[14px] text-ink-3 mt-3">No checks yet.</p>
          )}
        </div>
        <div>
          <h2 className="heading text-[17px]">Your links</h2>
          <p className="text-[14px] text-ink-2 mt-1 leading-[1.6]">TikTok captions aren&apos;t clickable, so most checks will come through your bio. Give each account its own code.</p>
          <dl className="well p-4 mt-4 m-0 flex flex-col gap-3 text-[13px]">
            {[
              ["TikTok bio", `${site}/creators?src=bio-tt`],
              ["Instagram bio", `${site}/creators?src=bio-ig`],
              ["YouTube Shorts description", `${site}/creators?src=yt`],
            ].map(([k, link]) => (
              <div key={k}>
                <dt className="text-ink-3">{k}</dt>
                <dd className="m-0 font-mono break-all">{link}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
