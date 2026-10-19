import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import AdCard from "@/components/app/ad-card";
import Avatar from "@/components/app/avatar";
import { LaunchBars } from "@/components/app/charts";
import Evidence, { type SignalRef } from "@/components/app/evidence";
import ObjectivesForm from "@/components/app/objectives-form";
import OpportunityCard, { OPPORTUNITY, type MoveVs } from "@/components/app/opportunity-card";
import PlayCard from "@/components/app/play-card";
import Timeline from "@/components/app/timeline";
import Translations from "@/components/app/translations";
import { LandscapeTable, YouVsThem, type LandscapeStats } from "@/components/app/landscape";
import SubmitButton from "@/components/app/submit-button";
import { IconRefresh } from "@/components/icons";
import { after } from "next/server";

import { scanNowAction } from "@/lib/actions";
import { scanBrand } from "@/lib/scan";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { isInboxConfigured } from "@/lib/env";
import { getBrand, getSelf, listAds, listChanges, listEmails, listReports, listRivals, listSiteChanges, listSocial } from "@/lib/data";
import type { Ad, ChangeKind, Opportunity, Report } from "@/lib/db/types";
import { ago, compact, daysRunningOf, isNoPageNote, isScanning, tagLabel, todayIso, withinDays, rivalHidden } from "@/lib/format";
import { buildTimeline } from "@/lib/timeline";
import { GOALS } from "@/lib/goals";
import { angleShares, leadAngle, weeklyLaunches, type AngleRead } from "@/lib/stats";
import { adStage, adCopyKey, groupAdVersions, PROVEN_DAYS } from "@/lib/diff";

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

/** The briefing's views: the answer first, the data behind it one tab deeper. */
const TABS = [
  { key: "moves", label: "Your moves" },
  { key: "compare", label: "You vs. rivals" },
  { key: "changes", label: "What changed" },
  { key: "rivals", label: "Rivals" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const tabCls = (active: boolean) =>
  `h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium whitespace-nowrap ${active ? "bg-bg text-ink shadow-[0_0_0_1px_var(--line),var(--shadow-sm)]" : "text-ink-2 hover:text-ink"}`;

const READ: Record<AngleRead, { label: string; cls: string }> = {
  gap: { label: "Gap", cls: "badge badge-outline !text-ink font-semibold" },
  lead: { label: "You lead", cls: "badge badge-pos" },
  par: { label: "On par", cls: "badge" },
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** A share of live ads as a short bar and its number. */
function Share({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <span className={`block h-full rounded-full ${strong ? "bg-ink" : "bg-ink-3"}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
      </span>
      <span className="w-9 text-right">{pct(value)}</span>
    </span>
  );
}

/** One figure in the strip under the answer. */
function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="px-4 py-3.5 min-w-0">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="text-[20px] font-semibold tracking-tight tnum mt-0.5 truncate">{value}</div>
      <div className="caption mt-0.5">{hint}</div>
    </div>
  );
}

/** Per instance: when a stalled scan was last resumed from this page, so refreshes do not pile resumes up. */
const resumes = new Map<string, number>();
const RESUME_EVERY_MS = 3 * 60_000;
function dueForResume(brandId: string): boolean {
  const last = resumes.get(brandId) ?? 0;
  if (Date.now() - last < RESUME_EVERY_MS) return false;
  resumes.set(brandId, Date.now());
  return true;
}

/** What the scan is doing right now, by stage (lib/scan.ts). */
const STAGE_LINE = {
  ads: "Reading every rival\u2019s ads, website and social accounts.",
  tag: "Tagging and scoring every ad.",
  report: "Writing your report.",
} as const;

export default async function Briefing({ searchParams }: { searchParams: Promise<{ scan?: string; tab?: string; move?: string }> }) {
  const { scan: scanFlag, tab: tabParam, move: moveParam } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  // A scan that went quiet past the stale window with its stage still saved was cut short
  // (a hand-off lost, a function killed). It is picked up again from here, once every few
  // minutes per instance, so a first scan never strands the owner on the confirm page.
  const stalled = brand.scan_status === "running" && !isScanning(brand) && Boolean(brand.scan_state);
  if (stalled && dueForResume(brand.id)) {
    after(() => scanBrand(brand.id).catch((err) => console.warn("[briefing] resume failed:", (err as Error).message)));
  }
  if (!brand.last_scan_at && !isScanning(brand) && brand.scan_status !== "error" && !stalled) redirect("/app/setup");

  const [allRivals, allAds, reports, changes, self, social, siteChanges, emails] = await Promise.all([
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
  // Rivals confirmed to run no Meta ads stay under Settings; the briefing is about the ones that do.
  const rivals = allRivals.filter((r) => !rivalHidden(r, allAds.filter((a) => a.rival_id === r.id && a.active).length));
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
  const running = isScanning(brand) || stalled;
  const locked = planState(brand).locked;
  const live = ads.filter((a) => a.active);
  const week = (k: ChangeKind, rivalId?: string) =>
    changes.filter((c) => c.kind === k && withinDays(c.detected_at, 7) && (!rivalId || c.rival_id === rivalId)).length;
  const siteWeek = (rivalId?: string) => siteChanges.filter((c) => withinDays(c.detected_at, 7) && (!rivalId || c.rival_id === rivalId)).length;
  const emailMonth = (rivalId?: string) => emails.filter((e) => withinDays(e.received_at, 30) && (!rivalId || e.rival_id === rivalId)).length;
  const feed = buildTimeline({ adChanges: changes, site: siteChanges.filter((c) => withinDays(c.detected_at, 14)), emails: emails.filter((e) => withinDays(e.received_at, 14)), emailHref }).filter(
    (e) => !self || e.rivalId !== self.id,
  );
  const recentSwaps = (brand.candidates?.swapped ?? []).filter((s) => withinDays(s.at, 2));
  // The competitor ads our score ranks highest, one card per piece of copy: what rivals keep funding, with the receipts.
  const topAds = groupAdVersions(live.filter((a) => a.rival_id !== self?.id && a.score !== null && a.score !== undefined))
    .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0))
    .slice(0, 6);
  const opportunities = latest?.body.opportunities ?? [];
  const act = opportunities.filter((o) => o.type !== "ignore");
  const skip = opportunities.filter((o) => o.type === "ignore");
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "moves";
  const tabHref = (k: Tab) => (k === "moves" ? "/app" : `/app?tab=${k}`);
  const openMove = Number(moveParam) || 1;
  const moveHref = (n: number) => `/app?move=${n}#move-${n}`;

  // The brand's own ads, read off its Page like a rival's, against each rival's.
  const mine = self ? allAds.filter((a) => a.rival_id === self.id) : [];
  const myLive = mine.filter((a) => a.active);
  const advertising = rivals.filter((r) => live.some((a) => a.rival_id === r.id));
  const angles = angleShares(mine, rivals.map((r) => ({ name: r.name, ads: ads.filter((a) => a.rival_id === r.id) })));
  const gaps = angles.filter((a) => a.read === "gap");
  const leads = angles.filter((a) => a.read === "lead");
  // Versions: live ads on one Page carrying the same copy.
  const copies = new Map<string, number>();
  for (const a of allAds) if (a.active) copies.set(`${a.rival_id}|${adCopyKey(a)}`, (copies.get(`${a.rival_id}|${adCopyKey(a)}`) ?? 0) + 1);
  const versions = (a: Ad) => copies.get(`${a.rival_id}|${adCopyKey(a)}`) ?? 1;
  const angleOf = (o: Opportunity) => leadAngle(o.evidence.map((id) => byArchive.get(id)).filter((a): a is Ad => Boolean(a)));
  const vsFor = (o: Opportunity): MoveVs | null => {
    const angle = angleOf(o);
    const rival = rivals.find((r) => o.competitors.some((c) => c.toLowerCase() === r.name.toLowerCase()));
    if (!angle || !rival) return null;
    const theirs = live.filter((a) => a.rival_id === rival.id);
    const on = (xs: Ad[]) => xs.filter((a) => a.angle?.toLowerCase() === angle).length;
    return { angle, them: { name: rival.name, n: on(theirs), of: theirs.length }, you: myLive.length ? { n: on(myLive), of: myLive.length } : null };
  };
  const moveOn = (angle: string) => act.findIndex((o) => angleOf(o) === angle) + 1;
  const goal = brand.objectives ? GOALS.find((g) => g.value === brand.objectives?.goal) ?? null : null;
  const goalLine = goal ? [goal.label, brand.objectives?.target_cost ? `target ${brand.objectives.target_cost}` : null].filter(Boolean).join(" · ") : null;
  const urgent = act.filter((o) => o.urgency === "high").length;

  // Ad health: the brand's live ads against the average rival running ads.
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const meanDays = (xs: Ad[]) => Math.round(avg(xs.map((a) => daysRunningOf(a) ?? 0)));
  const rivalLive = advertising.map((r) => live.filter((a) => a.rival_id === r.id));
  const health = {
    live: myLive.length,
    rivalsLive: Math.round(avg(rivalLive.map((x) => x.length))),
    proven: myLive.filter((a) => (daysRunningOf(a) ?? 0) >= PROVEN_DAYS).length,
    days: meanDays(myLive),
    rivalsDays: meanDays(live),
    launched: self ? week("launched", self.id) : 0,
    rivalsLaunched: Math.round(avg(advertising.map((r) => week("launched", r.id)))),
  };

  return (
    <div>
      {running && <AutoRefresh />}

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="heading text-[22px]">Briefing</h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {brand.name} · {rivals.length} rivals watched · last scan {ago(brand.last_scan_at)}
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

      {!brand.objectives && running && !latest && (
        <section className="card mt-6 p-5">
          <h2 className="text-[15px] font-semibold">While we read your competitors: what are you trying to do?</h2>
          <p className="text-[13px] text-ink-2 mt-1 mb-4">Your first report lands in about three minutes. Every recommendation in it is judged against this.</p>
          <ObjectivesForm objectives={null} />
        </section>
      )}
      {!brand.objectives && !(running && !latest) && (
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
          {STAGE_LINE[brand.scan_state?.stage ?? "ads"]} {latest ? "A few minutes; the page updates on its own." : "About three minutes in all; the page updates on its own, and the rivals below fill in as they are read."}
        </div>
      )}
      {recentSwaps.length > 0 && (
        <div className="card mt-6 px-5 py-4 text-[13.5px] text-ink-2">
          {recentSwaps.map((s) => (
            <div key={s.in}>
              <span className="font-medium text-ink">{s.out}</span> runs no Meta ads, so it was swapped for <span className="font-medium text-ink">{s.in}</span>, the next closest competitor.
            </div>
          ))}
        </div>
      )}
      {scanFlag === "recent" && !running && (
        <div className="card mt-6 px-5 py-4 text-[13.5px] text-ink-2">
          Scanned {ago(brand.last_scan_at)}. A scan reads every rival again, so the next one can start ten minutes after the last.
        </div>
      )}
      {stalled && (
        <div className="mt-6 rounded-xl border border-warn/30 bg-warn-bg px-5 py-4 text-[13.5px] text-warn">
          This scan went quiet while {STAGE_LINE[brand.scan_state!.stage].toLowerCase().replace(/\.$/, "")}. It is picking up where it stopped.
        </div>
      )}
      {brand.scan_status === "error" && brand.scan_error && (
        <div className="mt-6 rounded-xl border border-neg/30 bg-neg-bg px-5 py-4 text-[13.5px] text-neg">The last scan ran into a problem: {brand.scan_error}</div>
      )}
      {brand.scan_status === "idle" && brand.scan_error && (
        <div className="mt-6 rounded-xl border border-warn/30 bg-warn-bg px-5 py-4 text-[13.5px] text-warn">{brand.scan_error}</div>
      )}


      <nav className="mt-6 flex p-1 rounded-lg bg-muted overflow-x-auto w-fit max-w-full" aria-label="Briefing views">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} className={tabCls(tab === t.key)} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
            {t.key === "moves" && act.length > 0 && <span className="text-ink-3 tnum">{act.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "moves" && (
        <>
          {latest ? (
            <div className="card mt-4 overflow-hidden">
              <div className="p-6 sm:p-7">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="badge">{latest.kind === "baseline" ? "Last 30 days" : "Since the last scan"}</span>
                  <span className="text-ink-3">{fmtDate(latest.created_at)}</span>
                </div>
                <h2 className="heading text-[21px] sm:text-[23px] leading-[1.3] mt-3 max-w-[860px]">{latest.body.headline}</h2>
                <p className="text-[14.5px] text-ink-2 leading-[1.7] mt-3 max-w-[820px]">{latest.body.summary}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border-t border-line [&>*]:bg-bg">
                {goal ? (
                  <Fact label="Your goal" value={goal.label} hint={brand.objectives?.target_cost ? `Target ${brand.objectives.target_cost}` : "No target cost set"} />
                ) : (
                  <Fact label="Your goal" value={<Link href="/app/brand#goals" className="text-brand hover:underline">Set it</Link>} hint="Moves are ranked against it" />
                )}
                <Fact label="Moves" value={act.length} hint={urgent ? `${urgent} to act on this week` : "None urgent"} />
                <Fact label="Gaps" value={myLive.length ? gaps.length : "—"} hint={myLive.length ? "Angles rivals use, you don't" : "Your own ads aren't read yet"} />
                <Fact label="Where you lead" value={myLive.length ? leads.length : "—"} hint={leads.length ? leads.slice(0, 2).map((l) => tagLabel(l.angle)).join(", ") : "Angles you use more than rivals"} />
              </div>
            </div>
          ) : (
            !running && (
              <div className="card mt-4 p-7">
                <h2 className="heading text-[18px]">No report yet</h2>
                <p className="text-ink-2 mt-1">Run a scan to get your first read on the market.</p>
              </div>
            )
          )}

          {act.length > 0 && (
            <Section title="What to run next" aside={goalLine ? `Ranked against your goal: ${goalLine}` : "Ranked by urgency and confidence"}>
              <div className="flex flex-col gap-3">
                {act.map((o, n) => (
                  <OpportunityCard key={n} o={o} n={n + 1} open={openMove === n + 1} ads={byArchive} refs={refs} versions={versions} vs={vsFor(o)} goal={goalLine} />
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
                From {live.length} live ads across {rivals.length} competitors{myLive.length ? ` and ${myLive.length} of yours` : ""}, their websites{isInboxConfigured ? " and emails" : ""}, read {ago(brand.last_scan_at)}. Intent is inferred from public signals: how long an ad runs and how many versions it has hint at what works, they don&apos;t prove it.
              </p>
            </Section>
          )}

          {latest && !opportunities.length && (
            <Section title="Should you copy it?" aside="Their moves, judged against your brand and goals">
              {latest.body.translations?.length ? (
                <Translations items={latest.body.translations} ads={byArchive} />
              ) : (
                <div className="card p-5 text-[13.5px] text-ink-2">Your moves are written with the next report. Run a scan to get them now.</div>
              )}
            </Section>
          )}

          {latest && !opportunities.length && Boolean(latest.body.plays?.length) && (
            <Section title="Ads to make next" aside="Built from what's worth copying">
              <Plays report={latest} ads={byArchive} />
            </Section>
          )}
        </>
      )}

      {tab === "compare" && (
        <>
          <Section title="Where you win, where you're missing" aside={`Share of live ads by angle: your ${myLive.length} against the average of ${advertising.length} rivals`}>
            {!myLive.length && (
              <div className="card p-5 mb-3 text-[13.5px] text-ink-2">
                We haven&apos;t read live ads from your own Facebook Page yet, so your column reads 0%.{" "}
                <Link href="/app/brand" className="text-brand hover:underline">
                  Check your Page under Business DNA
                </Link>
                .
              </div>
            )}
            {angles.length ? (
              <div className="card overflow-x-auto">
                <table className="table min-w-[780px]">
                  <thead>
                    <tr>
                      <th>Angle</th>
                      <th className="!text-right">You</th>
                      <th className="!text-right">Rivals avg</th>
                      <th>Leans on it most</th>
                      <th>Read</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {angles.map((r) => {
                      const m = moveOn(r.angle);
                      return (
                        <tr key={r.angle}>
                          <td className="font-medium">{tagLabel(r.angle)}</td>
                          <td className="text-right tnum">
                            <Share value={r.you} strong />
                          </td>
                          <td className="text-right tnum">
                            <Share value={r.rivals} />
                          </td>
                          <td className="text-ink-2">{r.top ? `${r.top.name} · ${r.top.count} of their ads` : "—"}</td>
                          <td>
                            <span className={READ[r.read].cls}>{READ[r.read].label}</span>
                          </td>
                          <td className="text-right">
                            {m > 0 && (
                              <Link href={moveHref(m)} className="btn btn-secondary btn-sm">
                                See move {m}
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card p-5 text-[13.5px] text-ink-2">Angles appear once the scan has tagged every ad.</div>
            )}
          </Section>

          {myLive.length > 0 && (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
              <div className="card p-5">
                <div className="text-[13px] text-ink-2">Keep doing</div>
                {leads.length ? (
                  <ul className="list-none m-0 p-0 mt-2 flex flex-col gap-2 text-[13.5px] leading-[1.6]">
                    {leads.map((l) => (
                      <li key={l.angle}>
                        <span className="font-medium">{tagLabel(l.angle)}</span>
                        <span className="text-ink-2">
                          : {pct(l.you)} of your live ads, {pct(l.rivals)} for the average rival.
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13.5px] text-ink-2 mt-2">No angle where you clearly out-run your rivals yet.</p>
                )}
              </div>
              <div className="card p-5">
                <div className="text-[13px] text-ink-2">Your ad health</div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <div className="text-[26px] font-semibold tracking-tight tnum">{health.live}</div>
                    <div className="caption">Live · rivals avg {health.rivalsLive}</div>
                  </div>
                  <div>
                    <div className="text-[26px] font-semibold tracking-tight tnum">{health.proven}</div>
                    <div className="caption">Running {PROVEN_DAYS}+ days</div>
                  </div>
                  <div>
                    <div className="text-[26px] font-semibold tracking-tight tnum">{health.days}</div>
                    <div className="caption">Avg days live · rivals {health.rivalsDays}</div>
                  </div>
                </div>
                <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-3">
                  You launched {health.launched} new {health.launched === 1 ? "ad" : "ads"} this week; the average rival launched {health.rivalsLaunched}.
                  {health.rivalsLaunched >= 2 * Math.max(1, health.launched) ? " You may be testing too little to find the next winner." : ""}
                </p>
              </div>
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
        </>
      )}

      {tab === "changes" && (
        <>
          <div className={`mt-4 grid grid-cols-2 ${isInboxConfigured ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3`}>
            <Kpi label="Live ads" value={live.length} hint={`Across ${rivals.length} rivals`} />
            <Kpi label="Ad moves" value={week("launched") + week("stopped")} hint={`${week("launched")} new · ${week("stopped")} stopped · 7 days`} tone={week("launched") ? "text-pos" : ""} />
            <Kpi label="Website changes" value={siteWeek()} hint="Products, prices, promos · 7 days" tone={siteWeek() ? "text-warn" : ""} />
            {isInboxConfigured && <Kpi label="Competitor emails" value={emailMonth()} hint="Sent to subscribers · 30 days" />}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Section title="Patterns" aside={latest ? `${latest.body.insights.length} across ads, sites and email` : undefined}>
              {latest && latest.body.insights.length > 0 ? (
                <Insights report={latest} ads={byArchive} refs={refs} />
              ) : (
                <div className="card p-5 text-[13.5px] text-ink-2">Patterns are written with each report.</div>
              )}
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
                <Timeline events={feed.slice(0, 12)} rivalName={(id) => rivalName.get(id) ?? "?"} compact />
              ) : (
                <div className="card p-5 text-[13.5px] text-ink-2">No changes yet. New and stopped ads, website changes and competitor emails show up here as the daily scans find them.</div>
              )}
            </Section>
          </div>

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
        </>
      )}

      {tab === "rivals" && (
        <>
          {topAds.length >= 3 && (
            <Section title="What they keep paying for" aside={`The highest-scoring of ${live.length} live competitor ads · each opens in the Ad Library`}>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {topAds.map(({ lead, versions }) => (
                  <AdCard key={lead.id} ad={lead} rivalName={rivalName.get(lead.rival_id) ?? lead.page_name ?? undefined} versions={versions} />
                ))}
              </div>
            </Section>
          )}

          <Section title="Every rival">
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
        </>
      )}
    </div>
  );
}
