import { isDataForSeoConfigured } from "@/lib/env";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AnalysisProgress from "@/components/app/analysis-progress";
import AutoRefresh from "@/components/app/auto-refresh";
import SubmitButton from "@/components/app/submit-button";
import { briefLikelyInFlight, generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { sentenceCase } from "@/lib/text";
import { getUserRepo } from "@/lib/db";
import { refreshSnapshotAction } from "@/lib/snapshot/actions";

import { isOnlineBusiness } from "@/lib/signals/geo";
export const metadata = { title: "Company snapshot — TRND" };

const CheckIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
    <path d="M3 8L6 11L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
const EdgeIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
    <path d="M7.5 1L13 5v5l-5.5 4L2 10V5z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
  </svg>
);
const WatchIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
    <path d="M7.5 2L14 12.5H1z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
    <line x1="7.5" y1="6" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="7.5" cy="10.8" r="0.7" fill="currentColor" />
  </svg>
);

export default async function SnapshotPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const services = await repo.listServices(business.id);
  const brief = await repo.getBusinessBrief(business.id);
  // Missing → the onboarding background job is probably still writing it;
  // only kick a fresh generation if enough time has passed that it clearly
  // isn't coming. Either way the page waits politely and refreshes itself.
  if (!brief && !briefLikelyInFlight(business.created_at)) {
    after(async () => {
      try {
        await repo.upsertBusinessBrief(await generateBusinessBrief(business, services));
      } catch (err) {
        console.warn("[snapshot] background generation failed (non-fatal):", (err as Error).message);
      }
    });
  }

  const activeServices = services.filter((s) => s.is_active);
  const generatedOn = brief
    ? new Date(brief.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const isTemplate = brief?.model_used.startsWith("trnd-template");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Your analysis</span>
          <h1>How TRND reads {sentenceCase(business.name)}</h1>
          <p className="context">
            <b>{sentenceCase(business.category)}</b> ·{" "}
            {isOnlineBusiness(business) ? "Online DTC brand" : `${business.city}${business.region ? `, ${business.region}` : ""}`}
          </p>
        </div>
        <form action={refreshSnapshotAction}>
          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Re-reading your business…">
            Refresh snapshot
          </SubmitButton>
        </form>
      </div>

      <div className="profile-bar">
        <div className="p-stat"><span className="k">Category</span><div className="v text-[15px]">{sentenceCase(business.category)}</div></div>
        <div className="p-stat"><span className="k">{isOnlineBusiness(business) ? "Sells" : "Home base"}</span><div className="v text-[15px]">{isOnlineBusiness(business) ? "Online, US" : `${business.city}${business.region ? `, ${business.region}` : ""}`}</div></div>
        <div className="p-stat"><span className="k">Reach</span><div className="v">{isOnlineBusiness(business) ? "Nationwide" : `${business.radius_miles} mi`}</div></div>
        <div className="p-stat"><span className="k">Services</span><div className="v">{activeServices.length} active</div></div>
        <div className="p-stat"><span className="k">Price band</span><div className="v">{business.price_band ?? "$$"}</div></div>
      </div>

      {!brief ? (
        <div className="empty-state">
          <AutoRefresh everyMs={6000} />
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M8 6h18l6 6v22H8z" stroke="var(--ink-faint)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M26 6v6h6" stroke="var(--ink-faint)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M13 18h14M13 24h14M13 30h9" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h3>Your founding analysis is being written</h3>
          <p>
            TRND is reading {business.name} — positioning, who buys, the local market, pricing,
            and your first moves. Usually under two minutes; this page refreshes itself.
          </p>
          <div className="inline-block text-left">
            <AnalysisProgress startedAt={business.created_at} />
          </div>
        </div>
      ) : (
        <>
          {brief.positioning && (
            <div className="note-card note-card--lead">
              <span className="t">Positioning — the idea your ads should repeat</span>
              <p>{brief.positioning}</p>
            </div>
          )}

          {(brief.first_moves ?? []).length > 0 && (
            <div className="note-card border-amber">
              <span className="t text-(--amber-text)">Your first moves — run these in order</span>
              <ol className="m-0 pl-[18px] flex flex-col gap-2 font-body text-[14px] leading-[1.65] text-ink">
                {brief.first_moves.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
              <div className="flex items-center gap-[14px] mt-4 flex-wrap">
                <Link href="/app/opportunities" className="btn btn-primary btn-sm">
                  See this week&apos;s ranked plays
                </Link>
                <span className="font-mono text-[11px] text-ink-faint">
                  every week, live demand is ranked against this analysis
                </span>
              </div>
            </div>
          )}

          <div className="snap-cols">
            <div className="snap-col snap-col--good">
              <div className="icon">{CheckIcon}</div>
              <h4>What you do well — claim it in copy</h4>
              <ul>
                {brief.does_well.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="snap-col snap-col--edge">
              <div className="icon">{EdgeIcon}</div>
              <h4>Your edge — press these in ads</h4>
              <ul>
                {brief.advantages.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="snap-col snap-col--watch">
              <div className="icon">{WatchIcon}</div>
              <h4>Watch-outs — don&apos;t run these</h4>
              <ul>
                {brief.watchouts.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>

          {((brief.customer_segments ?? []).length > 0 || brief.market_context || brief.pricing_read) && (
            <div className="snap-cols">
              {(brief.customer_segments ?? []).length > 0 && (
                <div className="snap-col snap-col--edge">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <circle cx="5" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <circle cx="10.5" cy="6" r="1.9" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M1.5 13c.4-2.4 1.9-3.7 3.5-3.7s3.1 1.3 3.5 3.7M9 12.7c.3-1.8 1.4-2.8 2.6-2.8 1 0 1.9.7 2.4 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4>Who&apos;s buying — pick one per ad</h4>
                  <ul>
                    {brief.customer_segments.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.market_context && (
                <div className="snap-col snap-col--good">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <path d="M1.5 12.5L5 8l3 2.5 5.5-7" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h4>Your market — the opening for ads</h4>
                  <p>{brief.market_context}</p>
                </div>
              )}
              {brief.pricing_read && (
                <div className="snap-col snap-col--edge">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <path d="M7.5 1.5v12M10.7 3.8H6a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H4.1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4>Your pricing — the anchor number</h4>
                  <p>{brief.pricing_read}</p>
                </div>
              )}
            </div>
          )}

          {(brief.seasonality || brief.moat) && (
            <div className="snap-cols grid-cols-[1fr_1fr]">
              {brief.seasonality && (
                <div className="snap-col snap-col--good">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M7.5 4v3.5l2.5 1.7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4>When to spend — and when it&apos;s cheap</h4>
                  <p>{brief.seasonality}</p>
                </div>
              )}
              {brief.moat && (
                <div className="snap-col snap-col--edge">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <path d="M7.5 1.5L13 3.5v4c0 3.4-2.3 5.6-5.5 6.5C4.3 13.1 2 10.9 2 7.5v-4z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h4>What competitors can&apos;t copy</h4>
                  <p>{brief.moat}</p>
                </div>
              )}
            </div>
          )}

          {(brief.watch_terms ?? []).length > 0 && (
            <div className="note-card">
              <span className="t">What TRND watches for you</span>
              <div className="mini-chip-row mb-[10px]">
                {brief.watch_terms.map((t) => (
                  <span key={t} className="mini-chip">{t}</span>
                ))}
              </div>
              <p className="text-[12.5px]">
                Search phrases your customers actually type, read daily{isDataForSeoConfigured ? " in your own metro" : " — nationally until the metro volume feed is switched on"}. When one
                of them moves, it shows up ranked in{" "}
                <Link className="text-(--amber-text)" href="/app/picks">This week</Link> with a campaign
                ready to build — that&apos;s the point of this page.
              </p>
            </div>
          )}

          <div className="note-card">
            <span className="t">Where this analysis goes to work</span>
            <p>
              This isn&apos;t a report to file — it&apos;s the lens the rest of TRND looks through. The
              watch terms above feed the daily demand scan; every trend that scan finds is judged against
              your positioning and menu before it&apos;s allowed to rank; and when you build a campaign,
              the copy is written from your edge, your prices, and your voice — not a template.
              <span className="font-mono text-[11px] text-ink-faint block mt-2">
                {isTemplate ? "TRND category playbooks" : "AI analysis"} of your profile
                {business.website ? " + website" : ""}{generatedOn ? ` · ${generatedOn}` : ""} · regenerates
                when your profile changes · {brief.model_used} · {brief.prompt_version}
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}