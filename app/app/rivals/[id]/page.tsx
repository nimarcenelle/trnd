import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import { groupAdVersions } from "@/lib/diff";
import { topHooks, topicsByScore } from "@/lib/score";
import Avatar from "@/components/app/avatar";
import { AngleBars, LaunchBars } from "@/components/app/charts";
import { IconArrowUpRight } from "@/components/icons";
import { getSessionUser } from "@/lib/auth/session";
import HandlesForm from "@/components/app/handles-form";
import DataStatus from "@/components/app/data-status";
import { coverage } from "@/lib/coverage";
import InboxCard from "@/components/app/inbox-card";
import PageForm from "@/components/app/page-form";
import SocialCard from "@/components/app/social-card";
import { getBrand, getSelf, getSiteSnapshot, listAds, listEmails, listReports, listRivals, listSiteChanges, listSnapshots, listSocial } from "@/lib/data";
import { env, isInboxConfigured } from "@/lib/env";
import { inboxAddress } from "@/lib/inbox/parse";
import { buildTimeline } from "@/lib/timeline";
import Timeline from "@/components/app/timeline";
import { growthBy } from "@/lib/social/read";
import { adStage, daysRunning, TESTING_DAYS } from "@/lib/diff";
import { libraryLink, cleanCopy, ago, daysRunningOf, isNoPageNote, noPageSearched, todayIso, isNoAdsNote, isPausedNote } from "@/lib/format";
import { angleMix, weeklyLaunches } from "@/lib/stats";
import { OpportunityRow } from "@/components/app/opportunity-card";
import type { SignalRef } from "@/components/app/evidence";
import { socialFlags, youVsMarket } from "@/lib/insight";

export const metadata = { title: "Rival — TRND" };
// Pasting a Page starts a scan after the response, inside this route\'s time limit.
export const maxDuration = 300;

/** Everything one rival runs: their strategy, cadence, angle mix and every ad. */
export default async function RivalPage({ params, searchParams }: PageProps<"/app/rivals/[id]">) {
  const [{ id }, { view, sort }] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const rival = (await listRivals(brand.id)).find((r) => r.id === id);
  if (!rival) notFound();

  const [allAds, [latest], allSocial, siteChanges, emails, snapshot, self] = await Promise.all([
    listAds(brand.id),
    listReports(brand.id, 1),
    listSocial(brand.id),
    listSiteChanges(brand.id, { rivalId: rival.id, days: 90 }),
    listEmails(brand.id, { rivalId: rival.id, days: 90 }),
    getSiteSnapshot(rival.id),
    getSelf(brand.id),
  ]);
  const ads = allAds.filter((a) => a.rival_id === rival.id);
  // Every competitor's live ads: what this one's scores are measured against.
  const market = allAds.filter((a) => a.active && (!self || a.rival_id !== self.id));
  const mine = self ? allAds.filter((a) => a.rival_id === self.id) : [];
  const address = isInboxConfigured && rival.inbox_token ? inboxAddress(rival.name, rival.inbox_token, env.inboundDomain) : null;
  const social = allSocial.filter((p) => p.rival_id === rival.id);
  const growth = growthBy(await listSnapshots(social.map((p) => p.id)));
  const byDays = (a: (typeof ads)[number]) => daysRunningOf(a) ?? -1;
  // Best first by conversion score (longest running breaks ties, and orders ads not scored yet); ?sort=worst flips it.
  const worst = sort === "worst";
  const scoredAny = ads.some((a) => a.score !== null && a.score !== undefined);
  const live = ads
    .filter((a) => a.active)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byDays(b) - byDays(a));
  if (worst) live.reverse();
  const stopped = ads.filter((a) => !a.active).sort((a, b) => Date.parse(b.stopped_at ?? "") - Date.parse(a.stopped_at ?? ""));
  const playbookHooks = topHooks(live, 5);
  const playbookTopics = topicsByScore(live, 6);
  const today = todayIso();
  const read = latest?.body.rivals.find((r) => r.name.toLowerCase() === rival.name.toLowerCase());
  // What works for them: their highest-scoring copy, and the topics it is about.
  const working = groupAdVersions(ads.filter((a) => a.active && a.score !== null && a.score !== undefined))
    .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0))
    .slice(0, 3);
  const theirTopics = topicsByScore(ads.filter((a) => a.active), 2);
  const marketScores = market.filter((a) => a.score !== null && a.score !== undefined).map((a) => a.score!);
  const marketAvg = marketScores.length ? Math.round(marketScores.reduce((x, y) => x + y, 0) / marketScores.length) : null;
  const workingLine = theirTopics.length
    ? `Their best-scoring ads are about ${theirTopics.map((t) => `${t.topic.toLowerCase()} (${t.ads} ad${t.ads === 1 ? "" : "s"}, average ${t.avgScore})`).join(" and ")}${marketAvg !== null ? `. The average ad you watch scores ${marketAvg}.` : "."}`
    : null;
  // What it means for the brand: the report's moves that involve them, and their ads against the brand's own.
  const name = rival.name.toLowerCase();
  const moves = (latest?.body.opportunities ?? []).filter((o) => o.competitors.some((c) => c.toLowerCase().includes(name) || name.includes(c.toLowerCase())));
  const vs = youVsMarket({ you: mine, them: ads, nameOf: () => rival.name });
  const byArchive = new Map(allAds.map((a) => [a.archive_id, a]));
  const refs = new Map<string, SignalRef>([
    ...siteChanges.map((c) => [`site:${c.id}`, { kind: "site" as const, title: c.title, href: c.url }] as const),
    ...emails.map((e) => [`email:${e.id}`, { kind: "email" as const, title: e.subject, href: `/app/rivals/${rival.id}?view=emails#${e.id}` }] as const),
  ]);
  const showStopped = view === "stopped";
  const showSite = view === "site";
  const showEmails = view === "emails";
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

      <div className="mt-4">
        <DataStatus rival={rival} inbox={isInboxConfigured} coverage={coverage(rival, { activeAds: live.length, engagedAds: live.filter((a) => a.engagement).length, inbox: isInboxConfigured })} />
      </div>

      {rival.page_id && (
        <details className="mt-3">
          <summary className="caption hover:text-ink cursor-pointer">
            Reading the Facebook Page “{rival.page_name ?? rival.page_id}”. Wrong Page?
          </summary>
          <div className="mt-2 max-w-[560px]">
            <PageForm rivalId={rival.id} />
          </div>
        </details>
      )}

      {isNoPageNote(rival.last_error) || isNoAdsNote(rival.last_error) || isPausedNote(rival.last_error) ? (
        <div className="card mt-6 px-5 py-4">
          <p className="text-[14px] font-semibold">{isPausedNote(rival.last_error) ? `${rival.name} has paused its Meta ads` : `No Meta ads found for ${rival.name}`}</p>
          <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">
            {isNoPageNote(rival.last_error)
              ? `We checked their site for a Facebook link, searched the Ad Library under every name they might advertise as, and had the model look through every advertiser that came up${noPageSearched(rival.last_error) ? ` (${noPageSearched(rival.last_error)})` : ""}.`
              : rival.last_error}{" "}
            {isPausedNote(rival.last_error) ? "It comes back to the briefing the day an ad goes live." : "It stays off the briefing until it does, and is checked again every few days. If you know their Page, paste it."}
          </p>
          <div className="mt-3 max-w-[560px]">
            <PageForm rivalId={rival.id} />
          </div>
        </div>
      ) : (
        rival.last_error && <div className="mt-6 rounded-xl border border-neg/30 bg-neg-bg px-5 py-4 text-[13.5px] text-neg">{rival.last_error}</div>
      )}

      {working.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <h2 className="heading text-[15px]">What&apos;s working for them, and why</h2>
            <span className="caption hidden sm:block">Their highest-scoring ads · tap a score for why</span>
          </div>
          {workingLine && <p className="text-[14px] text-ink-2 leading-[1.6] mb-3 max-w-[860px]">{workingLine}</p>}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {working.map(({ lead, versions }) => (
              <AdCard key={lead.id} ad={lead} rivalName={rival.name} versions={versions} market={market} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 className="heading text-[15px]">What it means for {brand.name}</h2>
          <span className="caption hidden sm:block">Judged against your ads and goals</span>
        </div>
        {moves.length > 0 && (
          <ol className="list-none m-0 p-0 card divide-y divide-line mb-3">
            {moves.map((o, n) => (
              <li key={n}>
                <OpportunityRow o={o} n={n + 1} ads={byArchive} refs={refs} />
              </li>
            ))}
          </ol>
        )}
        {vs.missing.length + vs.better.length + vs.working.length > 0 ? (
          <div className="card grid grid-cols-[minmax(0,1fr)] md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line">
            {(
              [
                ["Where you beat them", vs.working, "text-pos"],
                ["Working for them, missing from you", vs.missing, "text-warn"],
                ["Where to get better", vs.better, "text-brand"],
              ] as const
            ).map(([title, items, tone]) => (
              <div key={title} className="px-5 py-4">
                <div className={`text-[12px] font-medium ${tone}`}>{title}</div>
                {items.length ? (
                  <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-2 text-[13.5px] leading-[1.55]">
                    {items.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 mt-2 text-[13.5px] text-ink-3">Nothing stands out.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          !moves.length && <p className="text-[13.5px] text-ink-2">Nothing to act on against {rival.name} in this report. Their moves are still tracked below.</p>
        )}
      </section>

      <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Live ads", live.length, "", "Running now"],
          ["Testing", live.filter((a) => adStage(a, today) === "testing").length, "text-brand", `Live under ${TESTING_DAYS} days`],
          ["Scaling", live.filter((a) => adStage(a, today) === "scaling").length, "text-pos", "Kept and expanded"],
          ["Stopped", stopped.length, stopped.length ? "text-neg" : "", rival.health?.history ? "Ended in the last 90 days" : "Since we started watching"],
        ].map(([label, n, tone, hint]) => (
          <div key={label as string} className="card px-4 py-3.5">
            <div className="text-[13px] text-ink-2">{label}</div>
            <div className={`text-[26px] font-semibold tracking-tight tnum mt-1 ${tone}`}>{n}</div>
            <div className="caption mt-0.5">{hint}</div>
          </div>
        ))}
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

      {(playbookHooks.length > 0 || playbookTopics.length > 0) && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <h2 className="heading text-[15px]">Their playbook</h2>
            <span className="caption">From their live ads, ranked by conversion score</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="card p-5">
              <h3 className="text-[13px] font-medium text-ink-2">Hooks they keep paying for</h3>
              <ol className="m-0 mt-3 p-0 list-none flex flex-col gap-3">
                {playbookHooks.map((a, i) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="text-[12px] text-ink-3 tnum w-4 shrink-0 pt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <a href={libraryLink(a.archive_id)} target="_blank" rel="noreferrer" className="text-[14px] font-medium leading-snug hover:underline">
                        &ldquo;{cleanCopy(a.hook)}&rdquo;
                      </a>
                      <div className="caption mt-0.5">
                        {[daysRunning(a, today) !== null ? `${daysRunning(a, today)} days` : null, a.variants > 1 ? `${a.variants} versions` : null, a.topic ? a.topic : null, `score ${a.score}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card p-5">
              <h3 className="text-[13px] font-medium text-ink-2">What their ads are about</h3>
              <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-2">
                {playbookTopics.map((t) => (
                  <li key={t.topic} className="flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="capitalize">{t.topic}</span>
                    <span className="caption tnum">{t.ads} ad{t.ads === 1 ? "" : "s"} · avg {t.avgScore}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="heading text-[15px] mb-3">Organic social</h2>
        {social.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {social.map((p) => (
              <SocialCard key={p.id} profile={p} growth={growth.get(p.id)} flags={socialFlags(p, growth.get(p.id), allSocial)} />
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

      <section id="signals" className="mt-10 scroll-mt-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="inline-flex p-1 rounded-lg bg-muted overflow-x-auto max-w-full">
            <Link href={`/app/rivals/${rival.id}#signals`} className={tab(!view || !["stopped", "site", "emails"].includes(String(view)))}>
              Active ads <span className="text-ink-3 tnum">{live.length}</span>
            </Link>
            <Link href={`/app/rivals/${rival.id}?view=stopped#signals`} className={tab(showStopped)}>
              Stopped <span className="text-ink-3 tnum">{stopped.length}</span>
            </Link>
            <Link href={`/app/rivals/${rival.id}?view=site#signals`} className={tab(showSite)}>
              Website <span className="text-ink-3 tnum">{siteChanges.length}</span>
            </Link>
            <Link href={`/app/rivals/${rival.id}?view=emails#signals`} className={tab(showEmails)}>
              Emails <span className="text-ink-3 tnum">{emails.length}</span>
            </Link>
          </div>
          <span className="caption hidden sm:block">
            {showSite ? (
              "Changes in the last 90 days"
            ) : showEmails ? (
              "Newest first"
            ) : showStopped ? (
              "Most recently stopped first"
            ) : scoredAny ? (
              <span className="inline-flex gap-3">
                <Link href={`/app/rivals/${rival.id}#signals`} className={worst ? "hover:text-ink" : "text-ink font-medium"}>
                  Best first
                </Link>
                <Link href={`/app/rivals/${rival.id}?sort=worst#signals`} className={worst ? "text-ink font-medium" : "hover:text-ink"}>
                  Worst first
                </Link>
              </span>
            ) : (
              "Longest running first"
            )}
          </span>
        </div>
        {showSite ? (
          <div className="grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="card p-5 self-start">
              <h3 className="text-[14px] font-semibold">Their site now</h3>
              {snapshot ? (
                <dl className="m-0 mt-3 flex flex-col gap-3 text-[13px] leading-[1.55]">
                  {snapshot.data.headlines[0] && (
                    <div>
                      <dt className="text-[12px] font-medium text-ink-3">Headline</dt>
                      <dd className="m-0 mt-0.5 text-[14px] font-medium">{snapshot.data.headlines[0]}</dd>
                    </div>
                  )}
                  {snapshot.data.description && (
                    <div>
                      <dt className="text-[12px] font-medium text-ink-3">How they describe themselves</dt>
                      <dd className="m-0 mt-0.5 text-ink-2">{snapshot.data.description}</dd>
                    </div>
                  )}
                  {snapshot.data.promos.length > 0 && (
                    <div>
                      <dt className="text-[12px] font-medium text-ink-3">Promotions</dt>
                      <dd className="m-0 mt-1 flex flex-wrap gap-1.5">
                        {snapshot.data.promos.slice(0, 6).map((p) => (
                          <span key={p} className="badge badge-warn !whitespace-normal !h-auto py-0.5">
                            {p}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {snapshot.data.products.length > 0 && (
                    <div>
                      <dt className="text-[12px] font-medium text-ink-3">Catalog</dt>
                      <dd className="m-0 mt-0.5 text-ink-2">
                        {snapshot.data.products.length} products
                        {(() => {
                          const prices = snapshot.data.products.map((p) => p.price).filter((p): p is number => p !== null);
                          const onSale = snapshot.data.products.filter((p) => p.compare_at).length;
                          return `${prices.length ? `, $${Math.min(...prices)}–$${Math.max(...prices)}` : ""}${onSale ? `, ${onSale} on sale` : ""}`;
                        })()}
                      </dd>
                    </div>
                  )}
                  <div className="caption">Read {ago(snapshot.captured_at)}</div>
                </dl>
              ) : (
                <p className="text-[13px] text-ink-2 mt-1.5">{rival.website ? "Their site is read on the next scan." : "Add their website to watch it."}</p>
              )}
            </div>
            {siteChanges.length ? (
              <Timeline events={buildTimeline({ adChanges: [], site: siteChanges, emails: [], emailHref: () => "" })} rivalName={() => rival.name} />
            ) : (
              <div className="card p-6 text-[13.5px] text-ink-2 self-start">
                No changes yet. New products, price moves, sales, promotions and new headlines show up here the day we see them.
              </div>
            )}
          </div>
        ) : showEmails ? (
          <div className="grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="self-start">
              <InboxCard rival={rival} address={address} configured={isInboxConfigured} />
            </div>
            {emails.length ? (
              <ul className="list-none m-0 p-0 card divide-y divide-line">
                {emails.map((e) => (
                  <li key={e.id} id={e.id} className="scroll-mt-6">
                    <details className="group">
                      <summary className="px-4 py-3 hover:bg-subtle transition-colors cursor-pointer block">
                        <div className="flex items-center gap-2 min-w-0">
                          {e.kind && <span className={e.kind === "promo" ? "badge badge-warn" : e.kind === "launch" ? "badge badge-pos" : "badge"}>{e.kind[0].toUpperCase() + e.kind.slice(1)}</span>}
                          {e.is_repeat && <span className="badge badge-outline">Repeat</span>}
                          <span className="ml-auto caption shrink-0">{ago(e.received_at)}</span>
                        </div>
                        <p className="text-[13.5px] font-medium mt-1.5">{e.subject || "(no subject)"}</p>
                        <p className="text-[12.5px] text-ink-3 mt-0.5 truncate">{[e.offer && e.offer !== "none" ? e.offer : null, e.theme].filter(Boolean).join(" · ") || e.preview}</p>
                      </summary>
                      <div className="px-4 pb-4">
                        <div className="well p-3.5 text-[13px] text-ink-2 leading-[1.6] whitespace-pre-line max-h-[420px] overflow-y-auto">{e.body ?? e.preview}</div>
                        {e.links.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {e.links.slice(0, 6).map((l) => (
                              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="badge badge-outline hover:!text-ink max-w-[260px] truncate">
                                {l.text || l.url.replace(/^https?:\/\//, "").split("/")[0]}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="card p-6 text-[13.5px] text-ink-2 self-start">No emails yet. Once their newsletter reaches this inbox, every send shows up here, tagged with its offer and theme.</div>
            )}
          </div>
        ) : shown.length ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            <p className="caption col-span-full m-0 -mb-1">
              Score: how well an ad is working for them, 0-100, from how long it has run, its reach rank, how many versions run, and engagement on the post it also runs as. Tap “Why it scores” on any ad.
            </p>
            {groupAdVersions(shown)
              .slice(0, 60)
              .map(({ lead, versions }) => (
                <AdCard key={lead.id} ad={lead} rivalName={rival.name} versions={versions} market={market} />
              ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-[13.5px] text-ink-2">{showStopped ? "No stopped ads yet." : "No active ads right now."}</div>
        )}
      </section>
    </div>
  );
}
