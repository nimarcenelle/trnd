import { redirect } from "next/navigation";

import AdCard from "@/components/app/ad-card";
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
import { getBrand, getSelf, listAds, listReports, listResults, listSnapshots, listSocial } from "@/lib/data";
import type { BrandProfile } from "@/lib/db/types";
import { PROVEN_DAYS } from "@/lib/diff";
import { daysRunningOf, isNoPageNote } from "@/lib/format";
import { growthBy } from "@/lib/social/read";

export const metadata = { title: "Business DNA — TRND" };
// Pasting a Page starts a scan after the response, inside this route\'s time limit.
export const maxDuration = 300;

const TIER = { budget: "Budget", mid: "Mid-range", premium: "Premium", unknown: "Not sure" } as const;

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>
      {items.length ? (
        <ul className="list-disc pl-4 m-0 mt-1.5 flex flex-col gap-1 text-[13.5px] leading-[1.5]">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3 mt-1.5">Not found on your site.</p>
      )}
    </div>
  );
}

function ProfileView({ p }: { p: BrandProfile }) {
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-3">
        <div>
          <h3 className="text-[13px] font-medium text-ink-2">What you sell</h3>
          <p className="text-[13.5px] mt-1.5 leading-[1.5]">{p.what_it_sells}</p>
        </div>
        <div>
          <h3 className="text-[13px] font-medium text-ink-2">Price</h3>
          <p className="text-[13.5px] mt-1.5 leading-[1.5]">
            {p.price_point} <span className="text-ink-3">· {TIER[p.price_tier]}</span>
          </p>
        </div>
        <div>
          <h3 className="text-[13px] font-medium text-ink-2">Who it&apos;s for</h3>
          <p className="text-[13.5px] mt-1.5 leading-[1.5]">{p.audience}</p>
        </div>
      </div>
      <List title="Main promises" items={p.value_props} />
      <List title="What makes you different" items={p.differentiators} />
      <List title="Proof" items={p.proof_points} />
      <List title="Current offers" items={p.offers} />
      <div className="sm:col-span-2">
        <h3 className="text-[13px] font-medium text-ink-2">Tone</h3>
        <p className="text-[13.5px] mt-1.5">{p.tone}</p>
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
  const [self, [latest], social, all, results] = await Promise.all([getSelf(brand.id), listReports(brand.id, 1), listSocial(brand.id), listAds(brand.id), listResults(brand.id)]);
  const goal = GOALS.find((g) => g.value === brand.objectives?.goal);
  const mine = self ? all.filter((a) => a.rival_id === self.id) : [];
  const theirs = all.filter((a) => a.active && (!self || a.rival_id !== self.id));
  const live = mine.filter((a) => a.active).sort((a, b) => (daysRunningOf(b) ?? 0) - (daysRunningOf(a) ?? 0));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const yourAvg = avg(live.map((a) => daysRunningOf(a) ?? 0));
  const theirAvg = avg(theirs.map((a) => daysRunningOf(a) ?? 0));
  const mySocial = self ? social.filter((p) => p.rival_id === self.id) : [];
  const growth = growthBy(await listSnapshots(mySocial.map((p) => p.id)));

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
        <div className="card p-5 sm:p-6">
          {brand.profile ? <ProfileView p={brand.profile} /> : <p className="text-[13.5px] text-ink-2">No profile yet. Fill it in below and the next report will use it.</p>}
          <details className="mt-6 border-t border-line pt-4 group">
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
            <div className="caption mt-0.5">Competitors: {theirAvg ?? "—"}</div>
          </div>
        </div>
        {live.length ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 mt-4">
            {live.slice(0, 12).map((a) => (
              <AdCard key={a.id} ad={a} rivalName={brand.name} />
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
              <SocialCard key={p.id} profile={p} growth={growth.get(p.id)} />
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
