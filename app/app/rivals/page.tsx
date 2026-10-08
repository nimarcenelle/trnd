import "@/app/read.css";
import "./board.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import { ago, ChangeLog, Feed, MissingList, SocialChips, YourAds } from "@/components/board/board-view";
import { getSessionUser } from "@/lib/auth/session";
import { buildBoard } from "@/lib/board/board";
import { getUserRepo } from "@/lib/db";
import { isAdLibraryApifyAvailable } from "@/lib/signals/adlibrary-apify";

export const metadata = { title: "Competitors — TRND" };

/** History the log and the board read from. */
const WINDOW_DAYS = 21;
/** A new brand's first reads land in the background; the page polls this long for them. */
const FIRST_READ_MINUTES = 30;

/**
 * Home: every tracked competitor's paid ads against the brand's own,
 * read daily. What you're missing first, then what happened, then the
 * wall of competitor feeds. Everything is computed by lib/board/board.ts
 * from the stored Ad Library reads.
 */
export default async function RivalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");

  const [competitors, competitorReads, ownReads] = await Promise.all([
    repo.listCompetitors(business.id).catch(() => []),
    repo.listCompetitorReads(business.id, { sinceDays: WINDOW_DAYS }).catch(() => []),
    repo.listOwnAdReads(business.id, { sinceDays: WINDOW_DAYS }).catch(() => []),
  ]);
  const now = new Date();
  const board = buildBoard({ business, competitors, competitorReads, ownReads, now });
  const read = board.rivals.filter((r) => r.summary).length;
  const fresh = now.getTime() - Date.parse(business.created_at) < FIRST_READ_MINUTES * 60_000;
  const waiting = fresh && (competitors.length === 0 || read < competitors.length || !board.you);
  const live = isAdLibraryApifyAvailable();

  return (
    <div className="bd">
      {waiting ? <AutoRefresh everyMs={15_000} times={120} /> : null}

      <header className="bd-head">
        <div>
          <span className="bd-live">
            <i aria-hidden="true" />
            {competitors.length > 0 ? `Rec · watching ${competitors.length} competitor${competitors.length === 1 ? "" : "s"}` : "Naming your competitors"}
            {board.lastReadAt ? ` · last read ${ago(board.lastReadAt, now)}` : ""}
          </span>
          <h1>
            {business.name} <em>vs. the competition.</em>
          </h1>
          <p className="rd-soft">Every competitor&rsquo;s Meta ads, read every day: what they launched, what they killed, what they keep paying for, and what you&rsquo;re missing.</p>
          <SocialChips handles={business.social_handles ?? {}} website={business.website} />
        </div>
        <div className="bd-you">
          <span className="rd-kicker">Your ads</span>
          {board.you ? (
            <div className="bd-you__stats">
              <div>
                <b>{board.you.summary.active}</b>
                <span>live</span>
              </div>
              <div>
                <b>{board.you.launchedThisWeek}</b>
                <span>new this week</span>
              </div>
              <div>
                <b>{board.you.summary.longestDays ?? "–"}</b>
                <span>longest, days</span>
              </div>
            </div>
          ) : (
            <p className="rd-soft">{live ? "First read of your ads is on its way." : "Ad reads switch on with the Ad Library key."}</p>
          )}
        </div>
      </header>

      {!live ? (
        <div className="rd-alert">
          <b>The cameras are off.</b> Reading the Ad Library needs <code>APIFY_TOKEN</code>. Everything below fills in on the first daily read after it&rsquo;s set.
        </div>
      ) : null}

      <section className="bd-section">
        <div className="bd-section__head">
          <span className="rd-kicker rd-kicker--gold">What you&rsquo;re missing</span>
          <h2>What they run that you don&rsquo;t.</h2>
        </div>
        {read === 0 ? (
          <div className="rd-panel bd-empty">
            <p className="rd-soft">
              {competitors.length === 0
                ? "Naming your competitors from your site. This takes a minute or two after signup."
                : `Reading ${competitors.length} competitors' ads now. What you're missing appears as soon as the first reads land.`}
            </p>
          </div>
        ) : (
          <MissingList missing={board.missing} />
        )}
      </section>

      <section className="bd-split">
        <div>
          <div className="bd-section__head">
            <span className="rd-kicker">The log</span>
            <h2>What happened.</h2>
          </div>
          <ChangeLog changes={board.changes} historyDays={board.historyDays} now={now} />
        </div>
        <div>
          <div className="bd-section__head">
            <span className="rd-kicker">Your live ads</span>
            <h2>What you&rsquo;re running.</h2>
          </div>
          <YourAds board={board} name={business.name} />
        </div>
      </section>

      <section className="bd-section">
        <div className="bd-section__head bd-section__head--row">
          <div>
            <span className="rd-kicker">The wall</span>
            <h2>Every competitor, on camera.</h2>
          </div>
          <Link href="/app/settings" className="rd-btn rd-btn--ghost rd-btn--sm">
            Add or remove competitors
          </Link>
        </div>
        {board.rivals.length === 0 ? (
          <div className="rd-panel bd-empty">
            <p className="rd-soft">No competitors yet. They&rsquo;re named from your site right after signup, or add them yourself in Settings.</p>
          </div>
        ) : (
          <div className="bd-wall">
            {board.rivals.map((r) => (
              <Feed key={r.id} rival={r} now={now} />
            ))}
          </div>
        )}
        <p className="rd-fine bd-note">
          The Ad Library shows when an ad started and where it runs, never what it spent or sold. An ad still running after three weeks is
          one its brand keeps paying for: a strong hint, not proof.
        </p>
      </section>
    </div>
  );
}
