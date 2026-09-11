import Link from "next/link";
import { notFound } from "next/navigation";

import Brand from "@/components/brand";
import { getAdminRepo } from "@/lib/db/admin";
import type { DemandSnapshot } from "@/lib/preview/types";

import "../snapshot.css";

/** Snapshots are built on demand and never change once stored. */
async function load(token: string): Promise<DemandSnapshot | null> {
  try {
    const row = await getAdminRepo().getPublicSnapshot(token);
    return (row?.payload as DemandSnapshot) ?? null;
  } catch (err) {
    console.warn("[snapshot] load failed:", (err as Error).message);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/snapshot/[token]">) {
  const { token } = await params;
  const snapshot = await load(token);
  if (!snapshot) return { title: "Snapshot — TRND" };
  const where = snapshot.business.city ? ` in ${snapshot.business.city}` : "";
  return {
    title: `${snapshot.business.name} — demand snapshot | TRND`,
    description: `What ${snapshot.business.name}${where} could advertise this week, measured in the ${snapshot.metroLabel}.`,
  };
}

const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}%`;

/**
 * The shareable result: everything TRND could say about a business from its
 * website alone. Written to be forwarded — an owner sends this to the friend
 * who runs the restaurant down the street, and that is the acquisition loop.
 */
export default async function SnapshotPage({ params }: PageProps<"/snapshot/[token]">) {
  const { token } = await params;
  const snapshot = await load(token);
  if (!snapshot) notFound();

  const { business, ad, demand, competition, moments, metroLabel, quiet } = snapshot;
  const measured = demand.filter((d) => d.measured);
  const built = new Date(snapshot.generatedAt);

  return (
    <main className="snap-shell">
      <header className="snap-nav">
        <Brand href="/" />
        <Link className="btn btn-primary btn-sm" href="/signup">
          Start free
        </Link>
      </header>

      <section className="snap-head">
        <span className="eyebrow">Demand snapshot</span>
        <h1 className="h-disp">{business.name}</h1>
        <p className="snap-lede">
          {business.city ? `${business.city} · ` : ""}
          {business.category} · read from{" "}
          <a href={business.website} rel="nofollow noopener noreferrer" target="_blank">
            {new URL(business.website).hostname.replace(/^www\./, "")}
          </a>{" "}
          on{" "}
          {built.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </section>

      {ad && (
        <section className="snap-ad">
          <span className="eyebrow">The ad we&apos;d run this week</span>
          <h2 className="snap-ad__hook">{ad.hook}</h2>
          <p className="snap-ad__angle">{ad.angle}</p>
          <dl className="snap-ad__grid">
            <div>
              <dt>Offer</dt>
              <dd>{ad.offer}</dd>
            </div>
            <div>
              <dt>Who sees it</dt>
              <dd>{ad.who}</dd>
            </div>
            <div>
              <dt>Built on</dt>
              <dd>
                &ldquo;{ad.term}&rdquo;
                {ad.service ? ` → your ${ad.service}` : ""}
              </dd>
            </div>
          </dl>
          {ad.headlines.length > 0 && (
            <div className="snap-ad__heads">
              <p className="mono-label">Headlines</p>
              <ul>
                {ad.headlines.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {ad.primaryText && <p className="snap-ad__body">{ad.primaryText}</p>}
        </section>
      )}

      {demand.length > 0 && (
        <section className="snap-block">
          <h2>What&apos;s moving{business.city ? ` in the ${metroLabel}` : ""}</h2>
          <ul className="snap-list">
            {demand.map((d) => (
              <li key={`${d.source}-${d.term}`}>
                <div>
                  <p className="snap-list__term">{d.term}</p>
                  <p className="snap-list__meta">
                    {d.measured
                      ? `${d.geoLabel}${d.interestLevel !== null ? ` · interest ${d.interestLevel}/100` : ""}`
                      : `${d.intentCount ?? 0} buying phrases in autocomplete — "near me", "cost", "book"`}
                  </p>
                </div>
                <div className="snap-list__right">
                  {typeof d.deltaPct === "number" && (
                    <span className={`pill ${d.deltaPct >= 0 ? "pill--up" : "pill--down"}`}>
                      {pct(d.deltaPct)}
                    </span>
                  )}
                  {d.url && (
                    <a href={d.url} rel="nofollow noopener noreferrer" target="_blank">
                      check it
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {measured.length === 0 && (
            <p className="context">
              No source could measure a weekly change for these terms today — the ad above is
              written from your menu and the calendar instead. That&apos;s the honest read, not
              a filled-in one.
            </p>
          )}
        </section>
      )}

      {competition.length > 0 && (
        <section className="snap-block">
          <h2>Who else is advertising on this</h2>
          <ul className="snap-list">
            {competition.map((c) => (
              <li key={c.term}>
                <div>
                  <p className="snap-list__term">
                    {c.activeAds && c.activeAds > 0
                      ? `${c.activeAds} active ad${c.activeAds === 1 ? "" : "s"} on "${c.term}"`
                      : `Nobody is running ads on "${c.term}"`}
                  </p>
                  {c.sample && (
                    <p className="snap-list__meta">
                      {c.advertisers[0] ?? "A rival"}: &ldquo;{c.sample}&rdquo;
                    </p>
                  )}
                </div>
                {c.url && (
                  <div className="snap-list__right">
                    <a href={c.url} rel="nofollow noopener noreferrer" target="_blank">
                      see the ads
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {moments.length > 0 && (
        <section className="snap-block">
          <h2>Coming up</h2>
          <ul className="snap-list">
            {moments.map((m) => (
              <li key={m.label}>
                <div>
                  <p className="snap-list__term">{m.label}</p>
                  <p className="snap-list__meta">{m.advice}</p>
                </div>
                <div className="snap-list__right">
                  <span className="pill">{m.daysOut} days out</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {business.services.length > 0 && (
        <section className="snap-block">
          <h2>What we read off your site</h2>
          <ul className="snap-chips">
            {business.services.map((s) => (
              <li key={s.name}>
                {s.name}
                {s.price ? <span> ${s.price.replace(/^\$/, "")}</span> : null}
              </li>
            ))}
          </ul>
          <p className="context">
            Every offer above is written against this list — TRND never promises something your
            menu doesn&apos;t carry.
          </p>
        </section>
      )}

      <section className="snap-cta">
        <h2>This is one week, written once.</h2>
        <p>
          TRND does this every Monday — measuring your terms, watching your rivals, writing the
          ad before you ask, and learning from what the last one returned.
        </p>
        <Link className="btn btn-primary" href="/signup">
          Start free for 14 days
        </Link>
        <p className="context">No card. Your snapshot carries over.</p>
      </section>

      <footer className="snap-foot">
        <p>
          Built from public information: {business.name}&apos;s own website, search demand
          measured in {metroLabel}, and the Meta Ad Library.
          {quiet.length > 0 && ` ${quiet.join(" and ")} had nothing to say today — so this snapshot doesn't pretend otherwise.`}
        </p>
        <p>
          <Link href="/">TRND</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/terms">Terms</Link>
        </p>
      </footer>
    </main>
  );
}
