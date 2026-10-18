import { redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
import { groupAdVersions } from "@/lib/diff";
import Avatar from "@/components/app/avatar";
import HandlesForm from "@/components/app/handles-form";
import PageForm from "@/components/app/page-form";
import { YouVsThem } from "@/components/app/landscape";
import ObjectivesForm from "@/components/app/objectives-form";
import { GOALS } from "@/lib/goals";
import ProfileForm from "@/components/app/profile-form";
import ResultsTable from "@/components/app/results-table";
import ResultsUpload from "@/components/app/results-upload";
import SubmitButton from "@/components/app/submit-button";
import { clearResultsAction } from "@/lib/actions";
import SocialCard from "@/components/app/social-card";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand, getSelf, listAds, listReports, listResults, listRivals, listSnapshots, listSocial } from "@/lib/data";
import type { BrandProfile } from "@/lib/db/types";
import { PROVEN_DAYS } from "@/lib/diff";
import { daysRunningOf, isNoPageNote } from "@/lib/format";
import { socialFlags, youVsMarket } from "@/lib/insight";
import { growthBy } from "@/lib/social/read";

export const metadata = { title: "Business DNA — TRND" };
// Pasting a Page starts a scan after the response, inside this route\'s time limit.
export const maxDuration = 300;

const TIER = { budget: "Budget", mid: "Mid-range", premium: "Premium", unknown: "Not sure" } as const;

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>
        {items.length > 0 && <span className="caption tnum">{items.length}</span>}
      </div>
      {items.length ? (
        <ul className="m-0 mt-2 p-0 list-none divide-y divide-line text-[13.5px] leading-[1.5]">
          {items.map((x, i) => (
            <li key={i} className="py-2 first:pt-1 last:pb-0">
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3 mt-2">{empty}</p>
      )}
    </div>
  );
}

/** The profile as a page, not a form dump: who you are on top, then each list in its own card. */
function ProfileView({ p }: { p: BrandProfile }) {
  const tone = p.tone
    .split(/,|\band\b/)
    .map((t) => t.trim())
    .filter(Boolean);
  const price = /^unknown/i.test(p.price_point) ? null : p.price_point;
  return (
    <div className="flex flex-col gap-3">
      <div className="card p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <div className="caption">What you sell</div>
            <p className="text-[16px] font-medium leading-[1.5] mt-1">{p.what_it_sells}</p>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <div className="caption">Who it&apos;s for</div>
              <p className="text-[13.5px] leading-[1.5] mt-1">{p.audience}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge badge-outline">{TIER[p.price_tier]}</span>
              {price && <span className="text-[13px] text-ink-2">{price}</span>}
              {tone.map((t) => (
                <span key={t} className="badge">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 grid-cols-[minmax(0,1fr)] md:grid-cols-2">
        <ListCard title="What you promise" items={p.value_props} empty="Not found on your site." />
        <ListCard title="What makes you different" items={p.differentiators} empty="Not found on your site." />
        <ListCard title="Proof you can point to" items={p.proof_points} empty="No reviews, numbers or press found on your site. Proof is what competitors' best ads lead with." />
        <ListCard title="Current offers" items={p.offers} empty="No offers found on your site." />
      </div>
    </div>
  );
}

/** The brand as TRND understands it: its profile, its own ads, its social, and where it stands. */
export default async function BrandPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const [self, [latest], social, all, results, rivals] = await Promise.all([
    getSelf(brand.id),
    listReports(brand.id, 1),
    listSocial(brand.id),
    listAds(brand.id),
    listResults(brand.id),
    listRivals(brand.id),
  ]);
  const goal = GOALS.find((g) => g.value === brand.objectives?.goal);
  const mine = self ? all.filter((a) => a.rival_id === self.id) : [];
  const theirs = all.filter((a) => a.active && (!self || a.rival_id !== self.id));
  const live = mine.filter((a) => a.active).sort((a, b) => (daysRunningOf(b) ?? 0) - (daysRunningOf(a) ?? 0));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const yourAvg = avg(live.map((a) => daysRunningOf(a) ?? 0));
  const theirAvg = avg(theirs.map((a) => daysRunningOf(a) ?? 0));
  const mySocial = self ? social.filter((p) => p.rival_id === self.id) : [];
  const growth = growthBy(await listSnapshots(mySocial.map((p) => p.id)));
  const nameOf = new Map(rivals.map((r) => [r.id, r.name]));
  const vs = latest?.body.you ?? youVsMarket({ you: mine, them: theirs, nameOf: (id) => nameOf.get(id) ?? "A competitor" });

  return (
    <div>
      <header className="flex items-center gap-3.5">
        <Avatar name={brand.name} size={44} />
        <div>
          <p className="caption">Business DNA</p>
          <h1 className="heading text-[22px] mt-0.5">{brand.name}</h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {brand.url.replace(/^https?:\/\/(www\.)?/, "")} · {brand.category}
          </p>
        </div>
      </header>

      {latest?.body.landscape && (
        <section className="mt-8">
          <h2 className="heading text-[15px] mb-1">You vs. your competitors</h2>
          <p className="text-[13.5px] text-ink-2 mb-3 max-w-[820px]">{latest.body.landscape.summary}</p>
          <YouVsThem landscape={latest.body.landscape} />
        </section>
      )}

      <section id="goals" className="mt-10 scroll-mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="heading text-[15px]">Goals</h2>
          <span className="caption">Decides which competitor moves are worth copying</span>
        </div>
        <div className="card p-5 sm:p-6">
          {goal ? (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-6">
              <div>
                <div className="caption">Goal</div>
                <div className="text-[15px] font-semibold mt-0.5">{goal.label}</div>
              </div>
              {brand.objectives?.monthly_budget && (
                <div>
                  <div className="caption">Monthly budget</div>
                  <div className="text-[15px] font-semibold mt-0.5 tnum">{brand.objectives.monthly_budget}</div>
                </div>
              )}
              {brand.objectives?.target_cost && (
                <div>
                  <div className="caption">Target cost</div>
                  <div className="text-[15px] font-semibold mt-0.5 tnum">{brand.objectives.target_cost}</div>
                </div>
              )}
              {brand.objectives?.focus && (
                <div>
                  <div className="caption">Focus</div>
                  <div className="text-[15px] font-semibold mt-0.5">{brand.objectives.focus}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-2 mb-5">Tell TRND what you&apos;re trying to do. Every recommendation is judged against it.</p>
          )}
          {goal ? (
            <details className="border-t border-line pt-4 group">
              <summary className="text-[13.5px] font-medium inline-flex items-center gap-1.5">
                <span className="transition-transform group-open:rotate-90">›</span> Edit goals
              </summary>
              <div className="mt-5">
                <ObjectivesForm objectives={brand.objectives} />
              </div>
            </details>
          ) : (
            <ObjectivesForm objectives={brand.objectives} />
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="heading text-[15px]">Brand profile</h2>
          <span className="caption">Every report is written against this</span>
        </div>
        {brand.profile ? <ProfileView p={brand.profile} /> : <div className="card p-5 text-[13.5px] text-ink-2">No profile yet. Fill it in below and the next report will use it.</div>}
        <div className="card p-5 sm:p-6 mt-3">
          <details className="group">
            <summary className="text-[13.5px] font-medium inline-flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90">›</span> Edit profile
            </summary>
            <div className="mt-5">
              <ProfileForm profile={brand.profile} />
            </div>
          </details>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="heading text-[15px] mb-3">Your Meta ads</h2>
        {self && (
          <details className="mb-3" open={!self.page_id && Boolean(self.last_error)}>
            <summary className="caption hover:text-ink cursor-pointer">
              {self.page_id ? `Reading your Facebook Page “${self.page_name ?? self.page_id}”. Wrong Page?` : "Set your Facebook Page"}
            </summary>
            <div className="mt-2 max-w-[560px]">
              <PageForm rivalId={self.id} />
            </div>
          </details>
        )}
        {(vs.working.length > 0 || vs.missing.length > 0 || vs.better.length > 0) && (
          <div className="card mb-3 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-line">
            {(
              [
                ["What your ads do well", vs.working, "text-pos"],
                ["What you're missing", vs.missing, "text-warn"],
                ["How to get better", vs.better, "text-brand"],
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
                  <p className="m-0 mt-2 text-[13.5px] text-ink-3">Nothing stands out yet.</p>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="card px-4 py-3.5">
            <div className="text-[13px] text-ink-2">Live ads</div>
            <div className="text-[26px] font-semibold tracking-tight tnum mt-1">{live.length}</div>
            <div className="caption mt-0.5">Competitors average {theirs.length && self ? Math.round(theirs.length / Math.max(1, new Set(theirs.map((a) => a.rival_id)).size)) : "—"}</div>
          </div>
          <div className="card px-4 py-3.5">
            <div className="text-[13px] text-ink-2">Running {PROVEN_DAYS}+ days</div>
            <div className="text-[26px] font-semibold tracking-tight tnum mt-1">{live.filter((a) => (daysRunningOf(a) ?? 0) >= PROVEN_DAYS).length}</div>
            <div className="caption mt-0.5">Ads you keep paying for</div>
          </div>
          <div className="card px-4 py-3.5">
            <div className="text-[13px] text-ink-2">Average days live</div>
            <div className="text-[26px] font-semibold tracking-tight tnum mt-1">{yourAvg ?? "—"}</div>
            <div className="caption mt-0.5">Competitors average {theirAvg ?? "—"}{theirAvg !== null && theirAvg !== undefined ? " days" : ""}</div>
          </div>
        </div>
        {live.length ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 mt-4">
            {groupAdVersions(live)
              .slice(0, 12)
              .map(({ lead, versions }) => (
                <AdCard key={lead.id} ad={lead} rivalName={brand.name} versions={versions} market={theirs} />
              ))}
          </div>
        ) : (
          <div className="card p-6 mt-4 text-[13.5px] text-ink-2">
            {self?.last_scraped_at
              ? "No active Meta ads found for your brand. If you do run ads, paste your Facebook Page above."
              : isNoPageNote(self?.last_error)
                ? "We couldn't find a Facebook Page running ads for your brand. If you run ads, paste your Page above."
                : "Your own ads are read on the next scan."}
            {self?.last_error && !isNoPageNote(self.last_error) && <span className="block text-neg mt-1">{self.last_error}</span>}
          </div>
        )}
      </section>

      <section id="results" className="mt-10 scroll-mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="heading text-[15px]">Past ad performance</h2>
          <span className="caption">From your Ads Manager</span>
        </div>
        {results.length > 0 && <ResultsTable rows={results} />}
        <div className={`card p-5 ${results.length ? "mt-3" : ""}`}>
          {!results.length && (
            <div className="mb-4">
              <p className="text-[13.5px] font-medium">Show TRND what has worked for you</p>
              <p className="text-[13px] text-ink-2 mt-1 leading-[1.6] max-w-[680px]">
                In Ads Manager, open the Ads tab, pick a date range (the last 90 days works well), then Reports → Export table data → CSV. Include Ad name,
                Amount spent, CTR, Results and Cost per result. TRND uses it to judge which competitor ideas fit you.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <ResultsUpload hasResults={results.length > 0} />
            {results.length > 0 && (
              <form action={clearResultsAction}>
                <SubmitButton className="btn btn-ghost btn-sm" pending="Removing…">
                  Remove results
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="heading text-[15px] mb-3">Your social</h2>
        {mySocial.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            {mySocial.map((p) => (
              <SocialCard key={p.id} profile={p} growth={growth.get(p.id)} flags={socialFlags(p, growth.get(p.id), social)} />
            ))}
          </div>
        )}
        {self && (
          <div className="card p-5">
            <p className="text-[13px] text-ink-2 mb-3">
              {mySocial.length ? "Your handles" : "Add your handles and they're read on the next scan."}
            </p>
            <HandlesForm rival={self} />
          </div>
        )}
      </section>
    </div>
  );
}
