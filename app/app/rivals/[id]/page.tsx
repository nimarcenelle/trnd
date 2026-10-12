import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand, listAds, listReports, listRivals } from "@/lib/data";
import { daysRunningOf } from "@/lib/format";

export const metadata = { title: "Rival — TRND" };

/** Every ad one rival runs, longest-running first, and the ones it killed. */
export default async function RivalPage({ params }: PageProps<"/app/rivals/[id]">) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const rival = (await listRivals(brand.id)).find((r) => r.id === id);
  if (!rival) notFound();

  const [ads, [latest]] = await Promise.all([listAds(brand.id, { rivalId: rival.id }), listReports(brand.id, 1)]);
  const byDays = (a: (typeof ads)[number]) => daysRunningOf(a) ?? -1;
  const live = ads.filter((a) => a.active).sort((a, b) => byDays(b) - byDays(a));
  const killed = ads.filter((a) => !a.active).sort((a, b) => Date.parse(b.stopped_at ?? "") - Date.parse(a.stopped_at ?? ""));
  const read = latest?.body.rivals.find((r) => r.name.toLowerCase() === rival.name.toLowerCase());

  const tally = (key: "angle" | "format") => {
    const counts = new Map<string, number>();
    for (const a of live) if (a[key]) counts.set(a[key]!, (counts.get(a[key]!) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  return (
    <div>
      <Link href="/app" className="mono-label">
        ← Dashboard
      </Link>
      <h1 className="h-disp text-[30px] mt-3 mb-1">{rival.name}</h1>
      <p className="m-0 text-ink-soft text-[14px]">
        {live.length} live ads · {killed.length} killed since we started watching
        {rival.page_id && (
          <>
            {" · "}
            <a className="underline" href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${rival.page_id}`} target="_blank" rel="noreferrer">
              Open in Ad Library
            </a>
          </>
        )}
      </p>
      {rival.last_error && <p className="text-red text-[14px]">{rival.last_error}</p>}

      {read && (
        <div className="card mt-6 grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mono-label">Strategy</span>
            <p className="mt-1 mb-0 text-[14px] leading-[1.6]">{read.strategy}</p>
          </div>
          <div>
            <span className="mono-label">Watch for</span>
            <p className="mt-1 mb-0 text-[14px] leading-[1.6]">{read.watch_for}</p>
          </div>
        </div>
      )}

      {live.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-6">
          {[...tally("angle"), ...tally("format")].map(([label, n]) => (
            <span key={label} className="pill">
              {label} × {n}
            </span>
          ))}
        </div>
      )}

      <h2 className="h-disp text-[20px] mt-10 mb-4">Live, longest-running first</h2>
      {live.length ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {live.map((a) => (
            <AdCard key={a.id} ad={a} />
          ))}
        </div>
      ) : (
        <p className="text-ink-soft">No live ads right now.</p>
      )}

      {killed.length > 0 && (
        <>
          <h2 className="h-disp text-[20px] mt-12 mb-4">Killed</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 opacity-80">
            {killed.slice(0, 24).map((a) => (
              <AdCard key={a.id} ad={a} badge={<span className="pill pill-stop">Killed</span>} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
