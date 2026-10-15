import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import Avatar from "@/components/app/avatar";
import { LaunchBars } from "@/components/app/charts";
import Evidence, { type SignalRef } from "@/components/app/evidence";
import OpportunityCard, { OPPORTUNITY } from "@/components/app/opportunity-card";
import PlayCard from "@/components/app/play-card";
import Timeline from "@/components/app/timeline";
import Translations from "@/components/app/translations";
import { LandscapeTable, YouVsThem, type LandscapeStats } from "@/components/app/landscape";
import SubmitButton from "@/components/app/submit-button";
import { IconRefresh } from "@/components/icons";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { isInboxConfigured } from "@/lib/env";
import { getBrand, getSelf, listAds, listChanges, listEmails, listReports, listRivals, listSiteChanges, listSocial } from "@/lib/data";
import type { Ad, ChangeKind, Report } from "@/lib/db/types";
import { ago, compact, daysRunningOf, isNoPageNote, isScanning, todayIso, withinDays } from "@/lib/format";
import { buildTimeline } from "@/lib/timeline";
import { weeklyLaunches } from "@/lib/stats";
import { adStage } from "@/lib/diff";

export const metadata = { title: "Briefing — TRND" };
// "Scan now" runs the scan after the response, inside this route's time limit.
export const maxDuration = 300;

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
        <h2 className="heading text-[15px] shrink-0">{title}</h2>
        {aside && <span className="caption text-right">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const STATUS = { new: { label: "New push", cls: "badge badge-pos" }, ongoing: { label: "Ongoing", cls: "badge" }, repeated: { label: "Repeated", cls: "badge badge-outline" } } as const;

function Insights({ report, ads, refs }: { report: Report; ads: Map<string, Ad>; refs: Map<string, SignalRef> }) {
  return (
    <ol className="list-none m-0 p-0 card divide-y divide-line">
      {report.body.insights.map((i, n) => (
        <li key={n} className="p-5 flex gap-4">
          <span className="w-6 h-6 rounded-full bg-muted text-ink-2 text-[12px] font-semibold grid place-items-center shrink-0 tnum">{n + 1}</span>
          <div className="min-w-0">
            <div className="flex items-start gap-2 justify-between">
              <h3 className="text-[14.5px] font-semibold leading-snug">{i.title}</h3>
              {i.status && <span className={`${STATUS[i.status].cls} shrink-0`}>{STATUS[i.status].label}</span>}
            </div>
            <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-1">{i.detail}</p>
            <Evidence ids={i.evidence} ads={ads} refs={refs} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Plays({ report, ads }: { report: Report; ads: Map<string, Ad> }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
      {(report.body.plays ?? []).map((p, n) => (
        <PlayCard key={n} play={p} n={n + 1} ads={ads} />
      ))}
    </div>
  );
}

/** What the scan is doing right now, by stage (lib/scan.ts). */
const STAGE_LINE = {
  ads: "Reading every rival\u2019s ads, website and social accounts.",
  tag: "Tagging and scoring every ad.",
  report: "Writing your report.",
} as const;

export default async function Briefing({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  const { scan: scanFlag } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  if (!brand.last_scan_at && !isScanning(brand) && brand.scan_status !== "error") redirect("/app/setup");

  const [rivals, allAds, reports, changes, self, social, siteChanges, emails] = await Promise.all([
    listRivals(brand.id),
    listAds(brand.id),
    listReports(brand.id),
    listChanges(brand.id),
    getSelf(brand.id),
    listSocial(brand.id),
    listSiteChanges(brand.id, { days: 60 }),
    listEmails(brand.id, { days: 60 }),
  ]);
  const emailHref = (e: { id: string; rival_id: string }) => `/app/rivals/${e.rival_id}?view=emails#${e.id}`;
  const refs = new Map<string, SignalRef>([
    ...siteChanges.map((c) => [`site:${c.id}`, { kind: "site" as const, title: c.title, href: c.url }] as const),
    ...emails.map((e) => [`email:${e.id}`, { kind: "email" as const, title: e.subject, href: emailHref(e) }] as const),
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
  const today = todayIso();
  const [latest, ...older] = reports;
  const running = isScanning(brand);
  const locked = planState(brand).locked;
  const live = ads.filter((a) => a.active);
  const week = (k: ChangeKind, rivalId?: string) =>
    changes.filter((c) => c.kind === k && withinDays(c.detected_at, 7) && (!rivalId || c.rival_id === rivalId)).length;
  const siteWeek = (rivalId?: string) => siteChanges.filter((c) => withinDays(c.detected_at, 7) && (!rivalId || c.rival_id === rivalId)).length;
  const emailMonth = (rivalId?: string) => emails.filter((e) => withinDays(e.received_at, 30) && (!rivalId || e.rival_id === rivalId)).length;
  const feed = buildTimeline({ adChanges: changes, site: siteChanges.filter((c) => withinDays(c.detected_at, 14)), emails: emails.filter((e) => withinDays(e.received_at, 14)), emailHref }).filter(
    (e) => !self || e.rivalId !== self.id,
  );
  const opportunities = latest?.body.opportunities ?? [];
  const act = opportunities.filter((o) => o.type !== "ignore");
  const skip = opportunities.filter((o) => o.type === "ignore");

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

      {!brand.objectives && (
        <Link href="/app/brand#goals" className="card mt-6 px-5 py-4 flex items-center justify-between gap-4 hover:shadow-[var(--shadow-md)] transition-shadow">
          <span>
            <span className="text-[13.5px] font-semibold">Tell TRND what you&apos;re trying to do</span>
            <span className="block text-[13px] text-ink-2 mt-0.5">Set your goal, budget and target cost, and every recommendation is judged against them.</span>
          </span>
          <span className="btn btn-secondary btn-sm shrink-0">Set goals</span>
        </Link>
      )}
      {running && (
        <div className="card mt-6 px-5 py-4 flex items-center gap-3 text-[13.5px]">
          <span className="spinner" />
          {STAGE_LINE[brand.scan_state?.stage ?? "ads"]} This takes a few minutes; the page updates on its own.
        </div>
      )}
      {scanFlag === "recent" && !running && (
        <div className="card mt-6 px-5 py-4 text-[13.5px] text-ink-2">
          Scanned {ago(brand.last_scan_at)}. A scan reads every rival again, so the next one can start ten minutes after the last.
        </div>
      )}
      {!running && brand.scan_status === "running" && brand.scan_state && (
        <div className="mt-6 rounded-xl border border-warn/30 bg-warn-bg px-5 py-4 text-[13.5px] text-warn">
          The last scan was cut short while {STAGE_LINE[brand.scan_state.stage].toLowerCase().replace(/\.$/, "")}. It picks up where it stopped on the next scan.
        </div>
      )}
      {brand.scan_status === "error" && brand.scan_error && (
        <div className="mt-6 rounded-xl border border-neg/30 bg-neg-bg px-5 py-4 text-[13.5px] text-neg">The last scan ran into a problem: {brand.scan_error}</div>
      )}
      {brand.scan_status === "idle" && brand.scan_error && (
        <div className="mt-6 rounded-xl border border-warn/30 bg-warn-bg px-5 py-4 text-[13.5px] text-warn">{brand.scan_error}</div>
      )}

      {latest ? (
        <div className="card mt-6 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="badge">{latest.kind === "baseline" ? "Last 30 days" : "Since the last scan"}</span>
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

      <div className={`mt-4 grid grid-cols-2 ${isInboxConfigured ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3`}>
        <Kpi label="Live ads" value={live.length} hint={`Across ${rivals.length} rivals`} />
        <Kpi label="Ad moves" value={week("launched") + week("stopped")} hint={`${week("launched")} new · ${week("stopped")} stopped · 7 days`} tone={week("launched") ? "text-pos" : ""} />
        <Kpi label="Website changes" value={siteWeek()} hint="Products, prices, promos · 7 days" tone={siteWeek() ? "text-warn" : ""} />
        {isInboxConfigured && <Kpi label="Competitor emails" value={emailMonth()} hint="Sent to subscribers · 30 days" />}
      </div>

      {act.length > 0 && (
        <Section title="What to do next" aside="Competitor moves, judged against your business">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
            {act.map((o, n) => (
              <OpportunityCard key={n} o={o} ads={byArchive} refs={refs} />
            ))}
          </div>
          {skip.length > 0 && (
            <div className="card mt-3 divide-y divide-line">
              {skip.map((o, n) => (
                <div key={n} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4">
                  <span className={`${OPPORTUNITY.ignore.cls} self-start`}>{OPPORTUNITY.ignore.label}</span>
                  <div className="min-w-0">
                    <span className="text-[13.5px] font-medium">{o.title}</span>
                    <span className="text-[13px] text-ink-2"> · {o.fit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="caption mt-3">
            Intent is inferred from public signals. Ad longevity and email frequency hint at what works; they don&apos;t prove it.
          </p>
        </Section>
      )}

      {latest && latest.body.insights.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section title="Patterns" aside={`${latest.body.insights.length} across ads, sites and email`}>
            <Insights report={latest} ads={byArchive} refs={refs} />
          </Section>
          <Section
            title="Activity"
            aside={
              <Link href="/app/timeline" className="hover:text-ink">
                Full timeline →
              </Link>
            }
          >
            {feed.length ? (
              <Timeline events={feed.slice(0, 9)} rivalName={(id) => rivalName.get(id) ?? "?"} compact />
            ) : (
              <div className="card p-5 text-[13.5px] text-ink-2">No changes yet. New and stopped ads, website changes and competitor emails show up here as the daily scans find them.</div>
            )}
          </Section>
        </div>
      )}

      {latest?.body.landscape && (
        <Section title="Where you stand" aside="Your profile against every competitor">
          <p className="text-[13.5px] text-ink-2 leading-[1.6] mb-3 max-w-[820px]">{latest.body.landscape.summary}</p>
          <LandscapeTable landscape={latest.body.landscape} you={brand.name} stats={statsFor} />
          <div className="mt-3">
            <YouVsThem landscape={latest.body.landscape} />
          </div>
        </Section>
      )}

      {latest && !opportunities.length && (
        <Section title="Should you copy it?" aside="Their moves, judged against your brand and goals">
          {latest.body.translations?.length ? (
            <Translations items={latest.body.translations} ads={byArchive} />
          ) : (
            <div className="card p-5 text-[13.5px] text-ink-2">Your opportunities are written with the next report. Run a scan to get them now.</div>
          )}
        </Section>
      )}

      {latest && !opportunities.length && Boolean(latest.body.plays?.length) && (
        <Section title="Ads to make next" aside="Built from what's worth copying">
          <Plays report={latest} ads={byArchive} />
        </Section>
      )}

      <Section title="Rivals">
        <div className="card overflow-x-auto">
          <table className="table min-w-[1060px]">
            <thead>
              <tr>
                <th>Rival</th>
                <th className="!text-right">Live ads</th>
                <th className="!text-right" title="Live under 14 days">Testing</th>
                <th className="!text-right" title="14+ days with 3+ versions, or 30+ days">Scaling</th>
                <th className="!text-right">New · 7d</th>
                <th className="!text-right">Stopped · 7d</th>
                <th className="!text-right">Longest running</th>
                <th className="!text-right" title="Website changes in the last 7 days">Site · 7d</th>
                <th className="!text-right" title="Marketing emails in the last 30 days">Emails · 30d</th>
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
                        {isNoPageNote(r.last_error) ? <span className="badge">No ads</span> : r.last_error && <span className="badge badge-neg">Can&apos;t read</span>}
                      </Link>
                    </td>
                    <td className="text-right tnum">{theirs.filter((a) => a.active).length}</td>
                    <td className="text-right tnum text-ink-2">{theirs.filter((a) => adStage(a, today) === "testing").length}</td>
                    <td className="text-right tnum font-medium">{theirs.filter((a) => adStage(a, today) === "scaling").length}</td>
                    <td className={`text-right tnum ${week("launched", r.id) ? "text-pos font-medium" : "text-ink-3"}`}>{week("launched", r.id)}</td>
                    <td className={`text-right tnum ${week("stopped", r.id) ? "text-neg font-medium" : "text-ink-3"}`}>{week("stopped", r.id)}</td>
                    <td className="text-right tnum">{longest ? `${longest} days` : "—"}</td>
                    <td className={`text-right tnum ${siteWeek(r.id) ? "text-warn font-medium" : "text-ink-3"}`}>{siteWeek(r.id)}</td>
                    <td className={`text-right tnum ${emailMonth(r.id) ? "" : "text-ink-3"}`}>{emailMonth(r.id)}</td>
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
                      <Insights report={r} ads={byArchive} refs={refs} />
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
