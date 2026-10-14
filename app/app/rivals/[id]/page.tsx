import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import Avatar from "@/components/app/avatar";
import { AngleBars, LaunchBars } from "@/components/app/charts";
import { IconArrowUpRight } from "@/components/icons";
import { getSessionUser } from "@/lib/auth/session";
import HandlesForm from "@/components/app/handles-form";
import InboxCard from "@/components/app/inbox-card";
import PageForm from "@/components/app/page-form";
import SocialCard from "@/components/app/social-card";
import { getBrand, getSiteSnapshot, listAds, listEmails, listReports, listRivals, listSiteChanges, listSnapshots, listSocial } from "@/lib/data";
import { env, isInboxConfigured } from "@/lib/env";
import { inboxAddress } from "@/lib/inbox/parse";
import { buildTimeline } from "@/lib/timeline";
import Timeline from "@/components/app/timeline";
import { growthBy } from "@/lib/social/read";
import { adStage, TESTING_DAYS } from "@/lib/diff";
import { ago, daysRunningOf, isNoPageNote, noPageSearched, todayIso } from "@/lib/format";
import { angleMix, weeklyLaunches } from "@/lib/stats";

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

  const [ads, [latest], allSocial, siteChanges, emails, snapshot] = await Promise.all([
    listAds(brand.id, { rivalId: rival.id }),
    listReports(brand.id, 1),
    listSocial(brand.id),
    listSiteChanges(brand.id, { rivalId: rival.id, days: 90 }),
    listEmails(brand.id, { rivalId: rival.id, days: 90 }),
    getSiteSnapshot(rival.id),
  ]);
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
  const today = todayIso();
  const read = latest?.body.rivals.find((r) => r.name.toLowerCase() === rival.name.toLowerCase());
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

      {isNoPageNote(rival.last_error) ? (
        <div className="card mt-6 px-5 py-4">
          <p className="text-[14px] font-semibold">No Meta ads found for {rival.name}</p>
          <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">
            We checked their site for a Facebook link, searched the Ad Library under every name they might advertise as, and had
            the model look through every advertiser that came up{noPageSearched(rival.last_error) ? ` (${noPageSearched(rival.last_error)})` : ""}. Most likely they are not running ads right now; we check again every day. If you know their Page, paste it.
          </p>
          <div className="mt-3 max-w-[560px]">
            <PageForm rivalId={rival.id} />
          </div>
        </div>
      ) : (
        rival.last_error && <div className="mt-6 rounded-xl border border-neg/30 bg-neg-bg px-5 py-4 text-[13.5px] text-neg">{rival.last_error}</div>
      )}

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Live ads", live.length, "", "Running now"],
          ["Testing", live.filter((a) => adStage(a, today) === "testing").length, "text-brand", `Live under ${TESTING_DAYS} days`],
          ["Scaling", live.filter((a) => adStage(a, today) === "scaling").length, "text-pos", "Kept and expanded"],
          ["Stopped", stopped.length, stopped.length ? "text-neg" : "", "Since we started watching"],
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
