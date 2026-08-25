import { redirect } from "next/navigation";

import SubmitButton from "@/components/app/submit-button";
import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { refreshSnapshotAction } from "@/lib/snapshot/actions";

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
  let brief = await repo.getBusinessBrief(business.id);
  if (!brief) {
    try {
      brief = await repo.upsertBusinessBrief(await generateBusinessBrief(business, services));
    } catch {
      brief = null;
    }
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
          <span className="eyebrow" style={{ margin: 0 }}>Company snapshot · your founding analysis</span>
          <h1>{business.name}, on paper.</h1>
          <p className="context">
            <b>{business.category}</b> · {business.city}
            {business.region ? `, ${business.region}` : ""} · shapes every recommendation you get
          </p>
        </div>
        <form action={refreshSnapshotAction}>
          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Re-reading your business…">
            Refresh snapshot
          </SubmitButton>
        </form>
      </div>

      <div className="profile-bar">
        <div className="p-stat"><span className="k">Category</span><div className="v" style={{ fontSize: 15 }}>{business.category}</div></div>
        <div className="p-stat"><span className="k">Home base</span><div className="v" style={{ fontSize: 15 }}>{business.city}{business.region ? `, ${business.region}` : ""}</div></div>
        <div className="p-stat"><span className="k">Reach</span><div className="v">{business.radius_miles} mi</div></div>
        <div className="p-stat"><span className="k">Services</span><div className="v">{activeServices.length} active</div></div>
        <div className="p-stat"><span className="k">Price band</span><div className="v">{business.price_band ?? "$$"}</div></div>
      </div>

      {!brief ? (
        <div className="panel" style={{ maxWidth: 620 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            The analysis couldn&apos;t be generated just now — hit refresh above to try again.
          </p>
        </div>
      ) : (
        <>
          {brief.positioning && (
            <div className="note-card note-card--lead">
              <span className="t">Positioning — the idea your ads should repeat</span>
              <p>{brief.positioning}</p>
            </div>
          )}

          <div className="snap-cols">
            <div className="snap-col snap-col--good">
              <div className="icon">{CheckIcon}</div>
              <h4>What you do well</h4>
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
              <h4>Watch-outs</h4>
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
                  <h4>Who&apos;s buying</h4>
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
                  <h4>Your local market</h4>
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
                  <h4>Your pricing, read</h4>
                  <p>{brief.pricing_read}</p>
                </div>
              )}
            </div>
          )}

          {(brief.seasonality || (brief.first_moves ?? []).length > 0) && (
            <div className="snap-cols" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {brief.seasonality && (
                <div className="snap-col snap-col--good">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M7.5 4v3.5l2.5 1.7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4>When demand moves</h4>
                  <p>{brief.seasonality}</p>
                </div>
              )}
              {(brief.first_moves ?? []).length > 0 && (
                <div className="snap-col snap-col--edge">
                  <div className="icon">
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <path d="M2 13L13 2M13 2H7M13 2v6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h4>Your first moves</h4>
                  <ol>
                    {brief.first_moves.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {(brief.watch_terms ?? []).length > 0 && (
            <div className="note-card">
              <span className="t">What TRND watches for you</span>
              <div className="mini-chip-row" style={{ marginBottom: 10 }}>
                {brief.watch_terms.map((t) => (
                  <span key={t} className="mini-chip">{t}</span>
                ))}
              </div>
              <p style={{ fontSize: 12.5 }}>
                Search phrases your customers actually use — pulled from this analysis and fed into
                the daily signal scan, alongside your category&apos;s stock terms.
              </p>
            </div>
          )}

          <div className="note-card">
            <span className="t">How we built this</span>
            <p>
              Read from {business.website ? "your website and " : ""}your profile — category, location,
              services, and prices — {isTemplate ? "using TRND's category playbooks" : "then analyzed by AI"}
              {generatedOn ? ` on ${generatedOn}` : ""}. It regenerates when your profile changes, or on
              demand with the refresh button above.
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)", display: "block", marginTop: 8 }}>
                {brief.model_used} · {brief.prompt_version}
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}