import Link from "next/link";
import { redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import AdThumb from "@/components/app/ad-thumb";
import AutoRefresh from "@/components/app/auto-refresh";
import SubmitButton from "@/components/app/submit-button";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { getBrand, listAds, listChanges, listReports, listRivals } from "@/lib/data";
import type { Ad, ChangeKind, ReportBody } from "@/lib/db/types";
import { ago, daysRunningOf, isScanning, libraryLink } from "@/lib/format";

export const metadata = { title: "Dashboard — TRND" };
// "Scan now" runs the scan after the response, inside this route's time limit.
export const maxDuration = 300;

const KIND_LABEL: Record<ChangeKind, string> = { launched: "New", stopped: "Killed", proven: "Proven" };
const KIND_PILL: Record<ChangeKind, string> = { launched: "pill pill-new", stopped: "pill pill-stop", proven: "pill pill-proven" };

function Evidence({ ids, ads }: { ids: string[]; ads: Map<string, Ad> }) {
  if (!ids.length) return null;
  return (
    <div className="flex gap-2 mt-3 flex-wrap">
      {ids.slice(0, 6).map((id) => {
        const ad = ads.get(id);
        return (
          <a key={id} href={libraryLink(id)} target="_blank" rel="noreferrer" title={ad?.page_name ?? id} className="block w-14 h-14 rounded-md overflow-hidden border border-line">
            <AdThumb src={ad?.image_url ?? null} label="ad" />
          </a>
        );
      })}
    </div>
  );
}

function ReportView({ body, ads }: { body: ReportBody; ads: Map<string, Ad> }) {
  return (
    <>
      <h2 className="h-disp text-[26px] mt-2 mb-3">{body.headline}</h2>
      <p className="text-ink-soft leading-[1.65] mt-0 mb-6 max-w-[760px]">{body.summary}</p>

      <h3 className="mono-label mb-3">What you wouldn&apos;t otherwise know</h3>
      <div className="grid gap-3 sm:grid-cols-2 mb-8">
        {body.insights.map((i, n) => (
          <div key={n} className="card">
            <div className="font-semibold mb-1">{i.title}</div>
            <p className="m-0 text-[14px] text-ink-soft leading-[1.6]">{i.detail}</p>
            <Evidence ids={i.evidence} ads={ads} />
          </div>
        ))}
      </div>

      <h3 className="mono-label mb-3">Ads to make next</h3>
      <div className="grid gap-3 mb-8">
        {body.plays.map((p, n) => (
          <div key={n} className="card">
            <div className="flex items-baseline gap-3">
              <span className="mono-label">0{n + 1}</span>
              <span className="font-semibold text-[16px]">{p.title}</span>
            </div>
            <p className="mt-2 mb-2 text-[14px] text-ink-soft leading-[1.6]">{p.why}</p>
            <p className="m-0 text-[14px] leading-[1.6] bg-bg-2 rounded-lg p-3 whitespace-pre-line">{p.brief}</p>
            <Evidence ids={p.inspired_by} ads={ads} />
          </div>
        ))}
      </div>
    </>
  );
}

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  if (!brand.last_scan_at && !isScanning(brand) && brand.scan_status !== "error") redirect("/app/setup");

  const [rivals, ads, reports, changes] = await Promise.all([
    listRivals(brand.id),
    listAds(brand.id),
    listReports(brand.id),
    listChanges(brand.id),
  ]);
  const byArchive = new Map(ads.map((a) => [a.archive_id, a]));
  const rivalName = new Map(rivals.map((r) => [r.id, r.name]));
  const [latest, ...older] = reports;
  const running = isScanning(brand);
  const locked = planState(brand).locked;

  return (
    <div>
      {running && <AutoRefresh />}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <span className="eyebrow">{brand.name}</span>
          <h1 className="h-disp text-[30px] mt-1 mb-1">Rival ad watch</h1>
          <p className="m-0 text-ink-soft text-[14px]">
            {rivals.length} rivals · {ads.filter((a) => a.active).length} live ads · last scan {ago(brand.last_scan_at)}
          </p>
        </div>
        {!locked && (
          <form action={scanNowAction}>
            <SubmitButton className="btn btn-ghost" pending="Starting…">
              {running ? "Scanning…" : "Scan now"}
            </SubmitButton>
          </form>
        )}
      </header>

      {running && (
        <div className="card mb-8 flex items-center gap-3">
          <i className="brand-rec inline-block w-2.5 h-2.5 rounded-full bg-mint" />
          Reading every rival&apos;s ads and writing your report. This takes a few minutes; the page updates itself.
        </div>
      )}
      {brand.scan_status === "error" && brand.scan_error && <div className="card mb-8 text-red">The last scan hit a problem: {brand.scan_error}</div>}

      {latest ? (
        <section className="mb-12">
          <span className="mono-label">
            {latest.kind === "baseline" ? "First read" : "Latest changes"} · {new Date(latest.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <ReportView body={latest.body} ads={byArchive} />
        </section>
      ) : (
        !running && <div className="card mb-12 text-ink-soft">No report yet. Run a scan to get one.</div>
      )}

      {changes.length > 0 && (
        <section className="mb-12">
          <h2 className="h-disp text-[22px] mb-4">Changes, last 14 days</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {changes
              .filter((c) => c.ad)
              .slice(0, 16)
              .map((c) => (
                <AdCard key={c.id} ad={c.ad!} rivalName={rivalName.get(c.rival_id)} badge={<span className={KIND_PILL[c.kind]}>{KIND_LABEL[c.kind]} · {ago(c.detected_at)}</span>} />
              ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <h2 className="h-disp text-[22px] mb-4">Rivals</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {rivals.map((r) => {
            const theirs = ads.filter((a) => a.rival_id === r.id && a.active);
            const longest = Math.max(0, ...theirs.map((a) => daysRunningOf(a) ?? 0));
            const strategy = latest?.body.rivals.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
            return (
              <Link key={r.id} href={`/app/rivals/${r.id}`} className="card hover:border-amber transition-colors">
                <div className="flex justify-between items-baseline gap-3">
                  <span className="font-semibold">{r.name}</span>
                  <span className="mono-label">
                    {theirs.length} live{longest ? ` · longest ${longest}d` : ""}
                  </span>
                </div>
                {strategy && <p className="mt-2 mb-0 text-[14px] text-ink-soft leading-[1.55]">{strategy.strategy}</p>}
                {r.last_error && <p className="mt-2 mb-0 text-[13px] text-red">{r.last_error}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      {older.length > 0 && (
        <section>
          <h2 className="h-disp text-[22px] mb-4">Earlier reports</h2>
          {older.map((r) => (
            <details key={r.id} className="card mb-3">
              <summary className="cursor-pointer">
                <span className="mono-label mr-3">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className="font-semibold">{r.body.headline}</span>
              </summary>
              <ReportView body={r.body} ads={byArchive} />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
