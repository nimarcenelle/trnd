import Link from "next/link";
import { redirect } from "next/navigation";

import AdThumb from "@/components/app/ad-thumb";
import AutoRefresh from "@/components/app/auto-refresh";
import Avatar from "@/components/app/avatar";
import Brief from "@/components/app/brief";
import { LaunchBars } from "@/components/app/charts";
import Evidence from "@/components/app/evidence";
import { LandscapeTable, YouVsThem, type LandscapeStats } from "@/components/app/landscape";
import SubmitButton from "@/components/app/submit-button";
import { IconRefresh } from "@/components/icons";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { getBrand, getSelf, listAds, listChanges, listReports, listRivals, listSocial } from "@/lib/data";
import type { Ad, ChangeKind, Report } from "@/lib/db/types";
import { ago, compact, daysRunningOf, isScanning, libraryLink, withinDays } from "@/lib/format";
import { weeklyLaunches } from "@/lib/stats";

export const metadata = { title: "Briefing — TRND" };
// "Scan now" runs the scan after the response, inside this route's time limit.
export const maxDuration = 300;

const KIND: Record<ChangeKind, { label: string; cls: string; verb: string }> = {
  launched: { label: "New", cls: "badge badge-pos", verb: "launched" },
  stopped: { label: "Stopped", cls: "badge badge-neg", verb: "stopped" },
  proven: { label: "Proven", cls: "badge badge-warn", verb: "passed 21 days with" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Kpi({ label, value, hint, tone = "" }: { label: string; value: number; hint: string; tone?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className={`text-[26px] font-semibold tracking-tight tnum mt-1 ${tone}`}>{value}</div>
      <div className="caption mt-0.5">{hint}</div>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="heading text-[15px]">{title}</h2>
        {aside && <span className="caption">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Insights({ report, ads }: { report: Report; ads: Map<string, Ad> }) {
  return (
    <ol className="list-none m-0 p-0 card divide-y divide-line">
      {report.body.insights.map((i, n) => (
        <li key={n} className="p-5 flex gap-4">
          <span className="w-6 h-6 rounded-full bg-muted text-ink-2 text-[12px] font-semibold grid place-items-center shrink-0 tnum">{n + 1}</span>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-semibold leading-snug">{i.title}</h3>
            <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-1">{i.detail}</p>
            <Evidence ids={i.evidence} ads={ads} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Plays({ report, ads }: { report: Report; ads: Map<string, Ad> }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
      {report.body.plays.map((p, n) => (
        <article key={n} className="card p-5 flex flex-col">
          <span className="caption">Idea {n + 1}</span>
          <h3 className="text-[15px] font-semibold leading-snug mt-1">{p.title}</h3>
          <p className="text-[13px] text-ink-2 leading-[1.6] mt-2">{p.why}</p>
          <div className="well p-3.5 mt-4">
            <Brief text={p.brief} />
          </div>
          <div className="mt-auto">
            <Evidence ids={p.inspired_by} ads={ads} label="Modeled on" />
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function Briefing() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  if (!brand.last_scan_at && !isScanning(brand) && brand.scan_status !== "error") redirect("/app/setup");

  const [rivals, allAds, reports, changes, self, social] = await Promise.all([
    listRivals(brand.id),
    listAds(brand.id),
    listReports(brand.id),
    listChanges(brand.id),
    getSelf(brand.id),
    listSocial(brand.id),
  ]);
  const byArchive = new Map(allAds.map((a) => [a.archive_id, a]));
  // Competitors' ads only; the brand's own are on its page and in the landscape.
  const ads = allAds.filter((a) => !self || a.rival_id !== self.id);
  const rivalName = new Map(rivals.map((r) => [r.id, r.name]));
  if (self) rivalName.set(self.id, "You");
  const followers = (rivalId: string, platform: "instagram" | "tiktok") => social.find((p) => p.rival_id === rivalId && p.platform === platform && !p.error)?.followers ?? null;
  const statsFor = (name: string): LandscapeStats | null => {
    const r = name.toLowerCase() === brand.name.toLowerCase() ? self : rivals.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!r) return null;
    const live = allAds.filter((a) => a.rival_id === r.id && a.active);
    return { liveAds: live.length, longest: Math.max(0, ...live.map((a) => daysRunningOf(a) ?? 0)), instagram: followers(r.id, "instagram"), tiktok: followers(r.id, "tiktok") };
  };
  const hasSocial = social.some((p) => !p.error && p.followers !== null);
  const [latest, ...older] = reports;
  const running = isScanning(brand);
  const locked = planState(brand).locked;
  const live = ads.filter((a) => a.active);
  const week = (k: ChangeKind, rivalId?: string) =>
    changes.filter((c) => c.kind === k && withinDays(c.detected_at, 7) && (!rivalId || c.rival_id === rivalId)).length;

  return (
    <div>
      {running && <AutoRefresh />}

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="heading text-[22px]">Briefing</h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {rivals.length} rivals watched · last scan {ago(brand.last_scan_at)}
          </p>
        </div>
        {!locked && (
          <form action={scanNowAction}>
            <SubmitButton className="btn btn-secondary" pending="Starting…">
              {running ? (
                <>
                  <span className="spinner" /> Scanning
                </>
              ) : (
                <>
                  <IconRefresh /> Scan now
                </>
              )}
            </SubmitButton>
          </form>
        )}
      </header>

      {running && (
        <div className="card mt-6 px-5 py-4 flex items-center gap-3 text-[13.5px]">
          <span className="spinner" />
          Reading every rival&apos;s ads and writing your report. This takes a few minutes; the page updates on its own.
        </div>
      )}
      {brand.scan_status === "error" && brand.scan_error && (
        <div className="mt-6 rounded-xl border border-neg/30 bg-neg-bg px-5 py-4 text-[13.5px] text-neg">The last scan ran into a problem: {brand.scan_error}</div>
      )}

      {latest ? (
        <div className="card mt-6 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="badge">{latest.kind === "baseline" ? "First read" : "Since the last scan"}</span>
            <span className="text-ink-3">{fmtDate(latest.created_at)}</span>
          </div>
          <h2 className="heading text-[21px] sm:text-[23px] leading-[1.3] mt-3 max-w-[860px]">{latest.body.headline}</h2>
          <p className="text-[14.5px] text-ink-2 leading-[1.7] mt-3 max-w-[820px]">{latest.body.summary}</p>
        </div>
      ) : (
        !running && (
          <div className="card mt-6 p-7">
            <h2 className="heading text-[18px]">No report yet</h2>
            <p className="text-ink-2 mt-1">Run a scan to get your first read on the market.</p>
          </div>
        )
      )}

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Live ads" value={live.length} hint={`Across ${rivals.length} rivals`} />
        <Kpi label="New ads" value={week("launched")} hint="Last 7 days" tone={week("launched") ? "text-pos" : ""} />
        <Kpi label="Stopped ads" value={week("stopped")} hint="Last 7 days" tone={week("stopped") ? "text-neg" : ""} />
        <Kpi label="Newly proven" value={week("proven")} hint="Passed 21 days live" tone={week("proven") ? "text-warn" : ""} />
      </div>

      {latest && latest.body.insights.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section title="Key insights" aside={`${latest.body.insights.length} findings`}>
            <Insights report={latest} ads={byArchive} />
          </Section>
          <Section title="Activity" aside="Last 14 days">
            {changes.length ? (
              <ul className="list-none m-0 p-0 card divide-y divide-line">
                {changes
                  .filter((c) => c.ad)
                  .slice(0, 9)
                  .map((c) => (
                    <li key={c.id}>
                      <a href={libraryLink(c.ad!.archive_id)} target="_blank" rel="noreferrer" className="flex gap-3 px-4 py-3 hover:bg-subtle transition-colors">
                        <div className="w-10 h-10 rounded-md overflow-hidden border border-line shrink-0">
                          <AdThumb src={c.ad!.image_url} label="Ad" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold truncate">{rivalName.get(c.rival_id)}</span>
                            <span className={KIND[c.kind].cls}>{KIND[c.kind].label}</span>
                            <span className="ml-auto caption shrink-0">{ago(c.detected_at)}</span>
                          </div>
                          <p className="text-[12.5px] text-ink-2 mt-0.5 truncate">{c.ad!.hook ?? c.ad!.body ?? ""}</p>
                        </div>
                      </a>
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="card p-5 text-[13.5px] text-ink-2">No changes yet. New, stopped and newly proven ads show up here as the daily scans find them.</div>
            )}
          </Section>
        </div>
      )}

      {latest?.body.landscape && (
        <Section title="Where you stand" aside="Positioning from your competitors' ads and your profile">
          <p className="text-[13.5px] text-ink-2 leading-[1.6] mb-3 max-w-[820px]">{latest.body.landscape.summary}</p>
          <LandscapeTable landscape={latest.body.landscape} you={brand.name} stats={statsFor} />
          <div className="mt-3">
            <YouVsThem landscape={latest.body.landscape} />
          </div>
        </Section>
      )}

      {latest && latest.body.plays.length > 0 && (
        <Section title="Ads to make next" aside="Modeled on what's working for your rivals">
          <Plays report={latest} ads={byArchive} />
        </Section>
      )}

      <Section title="Rivals">
        <div className="card overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Rival</th>
                <th className="!text-right">Live ads</th>
                <th className="!text-right">New · 7d</th>
                <th className="!text-right">Stopped · 7d</th>
                <th className="!text-right">Longest running</th>
                {hasSocial && <th className="!text-right">Instagram</th>}
                {hasSocial && <th className="!text-right">TikTok</th>}
                <th>Launches · 10 wks</th>
              </tr>
            </thead>
            <tbody>
              {rivals.map((r) => {
                const theirs = ads.filter((a) => a.rival_id === r.id);
                const longest = Math.max(0, ...theirs.filter((a) => a.active).map((a) => daysRunningOf(a) ?? 0));
                const href = `/app/rivals/${r.id}`;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={href} className="flex items-center gap-2.5 font-medium">
                        <Avatar name={r.name} size={24} />
                        {r.name}
                        {r.last_error && <span className="badge badge-neg">Can&apos;t read</span>}
                      </Link>
                    </td>
                    <td className="text-right tnum">{theirs.filter((a) => a.active).length}</td>
                    <td className={`text-right tnum ${week("launched", r.id) ? "text-pos font-medium" : "text-ink-3"}`}>{week("launched", r.id)}</td>
                    <td className={`text-right tnum ${week("stopped", r.id) ? "text-neg font-medium" : "text-ink-3"}`}>{week("stopped", r.id)}</td>
                    <td className="text-right tnum">{longest ? `${longest} days` : "—"}</td>
                    {hasSocial && <td className="text-right tnum">{compact(followers(r.id, "instagram"))}</td>}
                    {hasSocial && <td className="text-right tnum">{compact(followers(r.id, "tiktok"))}</td>}
                    <td>
                      <LaunchBars counts={weeklyLaunches(theirs, 10)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {older.length > 0 && (
        <Section title="Earlier reports">
          <div className="card divide-y divide-line">
            {older.map((r) => (
              <details key={r.id} className="group">
                <summary className="flex items-center gap-4 px-5 py-3.5 hover:bg-subtle transition-colors">
                  <span className="caption w-14 shrink-0 tnum">{fmtDate(r.created_at)}</span>
                  <span className="text-[13.5px] font-medium flex-1">{r.body.headline}</span>
                  <span className="text-ink-3 transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="px-5 pb-6">
                  <p className="text-[13.5px] text-ink-2 leading-[1.7] max-w-[820px]">{r.body.summary}</p>
                  {r.body.insights.length > 0 && (
                    <div className="mt-4">
                      <Insights report={r} ads={byArchive} />
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
