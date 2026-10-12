import { notFound, redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import { AngleBars, LaunchBars } from "@/components/app/charts";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand, listAds, listReports, listRivals } from "@/lib/data";
import { PROVEN_DAYS } from "@/lib/diff";
import { ago, daysRunningOf } from "@/lib/format";
import { angleMix, weeklyLaunches } from "@/lib/stats";

export const metadata = { title: "Rival — TRND" };

/** Everything one rival runs: the read, the cadence, the angle mix, every ad. */
export default async function RivalPage({ params }: PageProps<"/app/rivals/[id]">) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const rivals = await listRivals(brand.id);
  const index = rivals.findIndex((r) => r.id === id);
  const rival = rivals[index];
  if (!rival) notFound();

  const [ads, [latest]] = await Promise.all([listAds(brand.id, { rivalId: rival.id }), listReports(brand.id, 1)]);
  const byDays = (a: (typeof ads)[number]) => daysRunningOf(a) ?? -1;
  const live = ads.filter((a) => a.active).sort((a, b) => byDays(b) - byDays(a));
  const killed = ads.filter((a) => !a.active).sort((a, b) => Date.parse(b.stopped_at ?? "") - Date.parse(a.stopped_at ?? ""));
  const proven = live.filter((a) => byDays(a) >= PROVEN_DAYS).length;
  const read = latest?.body.rivals.find((r) => r.name.toLowerCase() === rival.name.toLowerCase());
  const libraryUrl = rival.page_id
    ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${rival.page_id}`
    : null;

  return (
    <div>
      <div className="flex items-center gap-3 label">
        <span className="flex items-center gap-2">
          <i className="dot dot-rec" /> Cam {String(index + 1).padStart(2, "0")}
        </span>
        <span className="text-line-2">/</span>
        <span>Read {ago(rival.last_scraped_at)}</span>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="disp text-[clamp(32px,4.5vw,52px)]">{rival.name}</h1>
          {rival.website && <p className="text-ink-3 mt-2 text-[14px]">{rival.website}</p>}
        </div>
        {libraryUrl && (
          <a className="btn btn-ghost btn-sm" href={libraryUrl} target="_blank" rel="noreferrer">
            Open in Ad Library ↗
          </a>
        )}
      </div>
      {rival.last_error && (
        <div className="panel mt-6 px-5 py-4 text-[14px]">
          <span className="label text-rec mr-2">Can&apos;t read</span>
          {rival.last_error}
        </div>
      )}

      <div className="mt-8 grid grid-cols-3 gap-px bg-line rounded-xl overflow-hidden border border-line">
        <div className="bg-bg-1 px-5 py-4">
          <div className="num text-[32px] leading-none">{live.length}</div>
          <div className="label !text-[10px] mt-2">Live ads</div>
        </div>
        <div className="bg-bg-1 px-5 py-4">
          <div className="num text-[32px] leading-none text-amber">{proven}</div>
          <div className="label !text-[10px] mt-2">Live {PROVEN_DAYS}+ days</div>
        </div>
        <div className="bg-bg-1 px-5 py-4">
          <div className="num text-[32px] leading-none text-rec">{killed.length}</div>
          <div className="label !text-[10px] mt-2">Killed since watching</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="panel p-5 sm:p-6">
          <span className="label">Their strategy</span>
          <p className="text-[15px] leading-[1.6] mt-3">{read?.strategy ?? "Written with the next report."}</p>
          {read?.watch_for && (
            <>
              <span className="label block mt-5">Watch for</span>
              <p className="text-[14px] text-ink-2 leading-[1.6] mt-2">{read.watch_for}</p>
            </>
          )}
        </div>
        <div className="panel p-5 sm:p-6">
          <span className="label">Launches per week</span>
          <div className="mt-5">
            <LaunchBars counts={weeklyLaunches(ads, 12)} height={96} />
          </div>
        </div>
        <div className="panel p-5 sm:p-6">
          <span className="label">Angles in live ads</span>
          <div className="mt-5">
            <AngleBars rows={angleMix(ads, 5)} />
          </div>
        </div>
      </div>

      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="disp text-[22px]">Live now</h2>
          <span className="label">Longest-running first</span>
        </div>
        {live.length ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {live.map((a) => (
              <AdCard key={a.id} ad={a} />
            ))}
          </div>
        ) : (
          <div className="panel p-6 text-ink-2">No live ads right now.</div>
        )}
      </section>

      {killed.length > 0 && (
        <section className="mt-14">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="disp text-[22px]">Killed</h2>
            <span className="label">Most recent first</span>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {killed.slice(0, 24).map((a) => (
              <AdCard key={a.id} ad={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
