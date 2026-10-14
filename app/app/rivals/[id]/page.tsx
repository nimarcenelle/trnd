import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import Avatar from "@/components/app/avatar";
import { AngleBars, LaunchBars } from "@/components/app/charts";
import { IconArrowUpRight } from "@/components/icons";
import { getSessionUser } from "@/lib/auth/session";
import HandlesForm from "@/components/app/handles-form";
import SocialCard from "@/components/app/social-card";
import { getBrand, listAds, listReports, listRivals, listSnapshots, listSocial } from "@/lib/data";
import { growthBy } from "@/lib/social/read";
import { PROVEN_DAYS } from "@/lib/diff";
import { ago, daysRunningOf } from "@/lib/format";
import { angleMix, weeklyLaunches } from "@/lib/stats";

export const metadata = { title: "Rival — TRND" };

/** Everything one rival runs: their strategy, cadence, angle mix and every ad. */
export default async function RivalPage({ params, searchParams }: PageProps<"/app/rivals/[id]">) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const rival = (await listRivals(brand.id)).find((r) => r.id === id);
  if (!rival) notFound();

  const [ads, [latest], allSocial] = await Promise.all([listAds(brand.id, { rivalId: rival.id }), listReports(brand.id, 1), listSocial(brand.id)]);
  const social = allSocial.filter((p) => p.rival_id === rival.id);
  const growth = growthBy(await listSnapshots(social.map((p) => p.id)));
  const byDays = (a: (typeof ads)[number]) => daysRunningOf(a) ?? -1;
  const live = ads.filter((a) => a.active).sort((a, b) => byDays(b) - byDays(a));
  const stopped = ads.filter((a) => !a.active).sort((a, b) => Date.parse(b.stopped_at ?? "") - Date.parse(a.stopped_at ?? ""));
  const proven = live.filter((a) => byDays(a) >= PROVEN_DAYS).length;
  const read = latest?.body.rivals.find((r) => r.name.toLowerCase() === rival.name.toLowerCase());
  const showStopped = view === "stopped";
  const shown = showStopped ? stopped : live;
  const libraryUrl = rival.page_id ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${rival.page_id}` : null;
  const tab = (active: boolean) =>
    `h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium ${active ? "bg-bg text-ink shadow-[0_0_0_1px_var(--line),var(--shadow-sm)]" : "text-ink-2 hover:text-ink"}`;

  return (
    <div>
      <Link href="/app" className="caption hover:text-ink">
        ← Briefing
      </Link>
      <header className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={rival.name} size={44} />
          <div>
            <h1 className="heading text-[22px]">{rival.name}</h1>
            <p className="text-[13px] text-ink-3 mt-0.5">
              {rival.website ?? rival.page_name ?? "Facebook Page"} · read {ago(rival.last_scraped_at)}
            </p>
          </div>
        </div>
        {libraryUrl && (
          <a className="btn btn-secondary" href={libraryUrl} target="_blank" rel="noreferrer">
            View in Ad Library <IconArrowUpRight />
          </a>
        )}
      </header>

      {rival.last_error && <div className="mt-6 rounded-xl border border-neg/30 bg-neg-bg px-5 py-4 text-[13.5px] text-neg">{rival.last_error}</div>}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="card px-4 py-3.5">
          <div className="text-[13px] text-ink-2">Live ads</div>
          <div className="text-[26px] font-semibold tracking-tight tnum mt-1">{live.length}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[13px] text-ink-2">Running {PROVEN_DAYS}+ days</div>
          <div className="text-[26px] font-semibold tracking-tight tnum mt-1">{proven}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[13px] text-ink-2">Stopped since watching</div>
          <div className="text-[26px] font-semibold tracking-tight tnum mt-1">{stopped.length}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="card p-5">
          <h2 className="text-[13px] font-medium text-ink-2">Strategy</h2>
          <p className="text-[14px] leading-[1.65] mt-2">{read?.strategy ?? "Written with the next report."}</p>
          {read?.watch_for && (
            <>
              <h2 className="text-[13px] font-medium text-ink-2 mt-4">What to watch for</h2>
              <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-1.5">{read.watch_for}</p>
            </>
          )}
        </div>
        <div className="card p-5 flex flex-col">
          <h2 className="text-[13px] font-medium text-ink-2">New ads per week</h2>
          <div className="mt-auto pt-6">
            <LaunchBars counts={weeklyLaunches(ads, 12)} height={88} width={300} />
            <div className="flex justify-between caption mt-2">
              <span>12 weeks ago</span>
              <span>This week</span>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-[13px] font-medium text-ink-2 mb-4">Angles in live ads</h2>
          <AngleBars rows={angleMix(ads, 5)} />
        </div>
      </div>

      <section className="mt-10">
        <h2 className="heading text-[15px] mb-3">Organic social</h2>
        {social.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {social.map((p) => (
              <SocialCard key={p.id} profile={p} growth={growth.get(p.id)} />
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-2 mb-3">
            {rival.instagram || rival.tiktok ? "Their accounts are read on the next scan." : "We couldn't find their Instagram or TikTok on their website. Add them and they're read on the next scan."}
          </p>
        )}
        <details className="mt-3 group">
          <summary className="text-[13px] text-ink-2 hover:text-ink inline-flex items-center gap-1.5">
            <span className="transition-transform group-open:rotate-90">›</span> {rival.instagram || rival.tiktok ? "Edit handles" : "Add handles"}
          </summary>
          <div className="card p-4 mt-3 max-w-[640px]">
            <HandlesForm rival={rival} />
          </div>
        </details>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="inline-flex p-1 rounded-lg bg-muted">
            <Link href={`/app/rivals/${rival.id}`} className={tab(!showStopped)}>
              Active <span className="text-ink-3 tnum">{live.length}</span>
            </Link>
            <Link href={`/app/rivals/${rival.id}?view=stopped`} className={tab(showStopped)}>
              Stopped <span className="text-ink-3 tnum">{stopped.length}</span>
            </Link>
          </div>
          <span className="caption hidden sm:block">{showStopped ? "Most recently stopped first" : "Longest running first"}</span>
        </div>
        {shown.length ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {shown.slice(0, 60).map((a) => (
              <AdCard key={a.id} ad={a} rivalName={rival.name} />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-[13.5px] text-ink-2">{showStopped ? "No stopped ads yet." : "No active ads right now."}</div>
        )}
      </section>
    </div>
  );
}
