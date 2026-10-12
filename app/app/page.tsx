import Link from "next/link";
import { redirect } from "next/navigation";

import AdThumb from "@/components/app/ad-thumb";
import AutoRefresh from "@/components/app/auto-refresh";
import Brief from "@/components/app/brief";
import { LaunchBars } from "@/components/app/charts";
import Evidence from "@/components/app/evidence";
import SubmitButton from "@/components/app/submit-button";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { getBrand, listAds, listChanges, listReports, listRivals } from "@/lib/data";
import type { Ad, ChangeKind, Report } from "@/lib/db/types";
import { ago, daysRunningOf, isScanning, libraryLink, withinDays } from "@/lib/format";
import { weeklyLaunches } from "@/lib/stats";

export const metadata = { title: "Briefing — TRND" };
// "Scan now" runs the scan after the response, inside this route's time limit.
export const maxDuration = 300;

const KIND: Record<ChangeKind, { label: string; tag: string }> = {
  launched: { label: "Launched", tag: "tag tag-mint" },
  stopped: { label: "Killed", tag: "tag tag-rec" },
  proven: { label: "Proven", tag: "tag tag-amber" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function Stat({ n, label, tone = "" }: { n: number; label: string; tone?: string }) {
  return (
    <div className="bg-bg-1 px-5 py-4">
      <div className={`num text-[34px] leading-none ${tone}`}>{n}</div>
      <div className="label !text-[10px] mt-2">{label}</div>
    </div>
  );
}

function ReportBody({ report, ads }: { report: Report; ads: Map<string, Ad> }) {
  const body = report.body;
  return (
    <>
      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="disp text-[22px]">What you wouldn&apos;t otherwise know</h2>
          <span className="label hidden sm:block">{body.insights.length} insights</span>
        </div>
        <ol className="list-none m-0 p-0 panel divide-y divide-line">
          {body.insights.map((i, n) => (
            <li key={n} className="p-5 sm:p-6 grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[48px_minmax(0,1fr)] gap-x-3">
              <span className="font-mono text-[12px] text-mint pt-1">{String(n + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-semibold text-[16.5px] leading-[1.35]">{i.title}</h3>
                <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-1.5 max-w-[760px]">{i.detail}</p>
                <Evidence ids={i.evidence} ads={ads} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="disp text-[22px]">Ads to make next</h2>
          <span className="label hidden sm:block">Modeled on what&apos;s working</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {body.plays.map((p, n) => (
            <article key={n} className="panel p-5 sm:p-6 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="num text-[30px] text-mint leading-none">{String(n + 1).padStart(2, "0")}</span>
                <span className="label !text-[10px]">Brief</span>
              </div>
              <h3 className="disp text-[18px] leading-[1.2] mt-4">{p.title}</h3>
              <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-2">{p.why}</p>
              <div className="inset p-4 mt-4">
                <Brief text={p.brief} />
              </div>
              <div className="mt-auto">
                <Evidence ids={p.inspired_by} ads={ads} label="Modeled on" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export default async function Briefing() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  if (!brand.last_scan_at && !isScanning(brand) && brand.scan_status !== "error") redirect("/app/setup");

  const [rivals, ads, reports, changes] = await Promise.all([listRivals(brand.id), listAds(brand.id), listReports(brand.id), listChanges(brand.id)]);
  const byArchive = new Map(ads.map((a) => [a.archive_id, a]));
  const rivalName = new Map(rivals.map((r) => [r.id, r.name]));
  const [latest, ...older] = reports;
  const running = isScanning(brand);
  const locked = planState(brand).locked;
  const live = ads.filter((a) => a.active);
  const thisWeek = (k: ChangeKind) => changes.filter((c) => c.kind === k && withinDays(c.detected_at, 7)).length;

  return (
    <div>
      {running && <AutoRefresh />}

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 label">
          <span>Briefing</span>
          <span className="text-line-2">/</span>
          <span>{fmtDate(latest?.created_at ?? new Date().toISOString())}</span>
        </div>
        {!locked && (
          <form action={scanNowAction}>
            <SubmitButton className="btn btn-ghost btn-sm" pending="Starting…">
              {running ? (
                <>
                  <i className="dot dot-rec" /> Scanning…
                </>
              ) : (
                "Scan now"
              )}
            </SubmitButton>
          </form>
        )}
      </header>

      {running && (
        <div className="panel relative overflow-hidden mt-6 px-5 py-4 flex items-center gap-3">
          <div className="scanline" aria-hidden />
          <i className="dot dot-rec" />
          <span className="text-[14px]">Reading every rival&apos;s ads and writing your report. This takes a few minutes; the page updates itself.</span>
        </div>
      )}
      {brand.scan_status === "error" && brand.scan_error && (
        <div className="panel mt-6 px-5 py-4 text-[14px] border-rec/40">
          <span className="label text-rec mr-2">Scan problem</span>
          {brand.scan_error}
        </div>
      )}

      {latest ? (
        <section className="mt-8">
          <span className="eyebrow">
            <i className="dot" /> {latest.kind === "baseline" ? "First read" : "Since the last scan"}
          </span>
          <h1 className="disp text-[clamp(26px,3.4vw,40px)] leading-[1.12] mt-4 max-w-[980px]">{latest.body.headline}</h1>
          <p className="text-[16px] text-ink-2 leading-[1.7] mt-5 max-w-[820px]">{latest.body.summary}</p>
        </section>
      ) : (
        !running && (
          <section className="mt-8">
            <h1 className="disp text-[32px]">No report yet.</h1>
            <p className="text-ink-2 mt-3">Run a scan to get your first read on the market.</p>
          </section>
        )
      )}

      <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-xl overflow-hidden border border-line">
        <Stat n={live.length} label={`Live ads · ${rivals.length} rivals`} />
        <Stat n={thisWeek("launched")} label="Launched · 7 days" tone="text-mint" />
        <Stat n={thisWeek("stopped")} label="Killed · 7 days" tone="text-rec" />
        <Stat n={thisWeek("proven")} label="Proven · 7 days" tone="text-amber" />
      </div>

      {latest && <ReportBody report={latest} ads={byArchive} />}

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="disp text-[22px]">Rivals</h2>
            <span className="label">Launches per week</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {rivals.map((r, i) => {
              const theirs = ads.filter((a) => a.rival_id === r.id);
              const liveAds = theirs.filter((a) => a.active).sort((a, b) => (daysRunningOf(b) ?? 0) - (daysRunningOf(a) ?? 0));
              const top = liveAds[0];
              return (
                <Link key={r.id} href={`/app/rivals/${r.id}`} className="panel overflow-hidden flex hover:border-line-2 transition-colors">
                  <div className="cam cam-sm w-[92px] shrink-0">
                    <AdThumb src={top?.image_url ?? null} label={`Cam ${String(i + 1).padStart(2, "0")}`} />
                  </div>
                  <div className="p-4 flex-1 min-w-0 flex flex-col">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold truncate">{r.name}</span>
                      <span className="font-mono text-[11px] text-ink-3 shrink-0">{liveAds.length} live</span>
                    </div>
                    {r.last_error ? (
                      <p className="text-[12.5px] text-rec mt-1 leading-[1.45] line-clamp-2">{r.last_error}</p>
                    ) : (
                      <p className="text-[12.5px] text-ink-3 mt-0.5">
                        {top ? `Longest live: ${daysRunningOf(top)}d` : "No live ads"}
                      </p>
                    )}
                    <div className="mt-auto pt-3">
                      <LaunchBars counts={weeklyLaunches(theirs, 10)} height={28} labels={false} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="disp text-[22px]">Live feed</h2>
            <span className="label">14 days</span>
          </div>
          {changes.length ? (
            <ul className="list-none m-0 p-0 panel divide-y divide-line">
              {changes
                .filter((c) => c.ad)
                .slice(0, 12)
                .map((c) => (
                  <li key={c.id}>
                    <a href={libraryLink(c.ad!.archive_id)} target="_blank" rel="noreferrer" className="flex gap-3.5 p-3.5 hover:bg-bg-2 transition-colors">
                      <div className="cam cam-sm w-11 h-[55px] shrink-0 rounded-[5px]">
                        <AdThumb src={c.ad!.image_url} label="ad" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={KIND[c.kind].tag}>{KIND[c.kind].label}</span>
                          <span className="text-[13.5px] font-semibold truncate">{rivalName.get(c.rival_id)}</span>
                          <span className="ml-auto font-mono text-[11px] text-ink-3 shrink-0">{ago(c.detected_at)}</span>
                        </div>
                        <p className="text-[13px] text-ink-2 mt-1.5 truncate">{c.ad!.hook ? `“${c.ad!.hook}”` : (c.ad!.body ?? "")}</p>
                      </div>
                    </a>
                  </li>
                ))}
            </ul>
          ) : (
            <div className="panel p-6 text-[14px] text-ink-2">Quiet so far. Launches, kills and newly proven ads show up here as the daily scans find them.</div>
          )}
        </section>
      </div>

      {older.length > 0 && (
        <section className="mt-14">
          <h2 className="disp text-[22px] mb-5">Earlier reports</h2>
          <div className="panel divide-y divide-line">
            {older.map((r) => (
              <details key={r.id} className="group">
                <summary className="flex items-baseline gap-4 p-5 hover:bg-bg-2 transition-colors">
                  <span className="label shrink-0 w-[92px]">{fmtDate(r.created_at)}</span>
                  <span className="font-semibold flex-1">{r.body.headline}</span>
                  <span className="text-ink-3 group-open:rotate-90 transition-transform">›</span>
                </summary>
                <div className="px-5 pb-8">
                  <p className="text-ink-2 leading-[1.7] max-w-[820px]">{r.body.summary}</p>
                  {r.body.insights.length > 0 && <ReportBody report={r} ads={byArchive} />}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
