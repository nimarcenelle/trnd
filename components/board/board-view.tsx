import Link from "next/link";

import { AdCard, days } from "@/components/read/parts";
import type { Board, BoardRival, Change, Missing } from "@/lib/board/board";
import type { SocialHandles } from "@/lib/db/types";

/**
 * The board, drawn: what you're missing, what happened, and the wall of
 * competitor feeds. Server-rendered from lib/board/board.ts; nothing here
 * computes, it only lays out what the reads said.
 */

const PLACEMENT: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

export function libraryUrl(name: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(name)}&search_type=page`;
}

function when(day: string, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ago(iso: string | null, now: Date): string {
  if (!iso) return "not yet";
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function SocialChips({ handles, website }: { handles: SocialHandles; website: string | null }) {
  const links: { label: string; href: string }[] = [];
  if (website) links.push({ label: website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: website });
  if (handles.instagram) links.push({ label: `IG @${handles.instagram}`, href: `https://www.instagram.com/${handles.instagram}` });
  if (handles.tiktok) links.push({ label: `TikTok @${handles.tiktok}`, href: `https://www.tiktok.com/@${handles.tiktok}` });
  if (handles.facebook) links.push({ label: `FB ${handles.facebook}`, href: `https://www.facebook.com/${handles.facebook}` });
  if (links.length === 0) return null;
  return (
    <div className="bd-chips">
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="bd-chip">
          {l.label}
        </a>
      ))}
    </div>
  );
}

function Ratio({ m }: { m: Missing }) {
  return (
    <span className="bd-ratio" title={`${m.rivalsUsing} of ${m.rivalsRead} competitors`}>
      <b>{m.rivalsUsing}</b>/{m.rivalsRead}
    </span>
  );
}

export function MissingList({ missing }: { missing: Missing[] }) {
  if (missing.length === 0) {
    return (
      <div className="rd-panel bd-empty">
        <p className="rd-soft">Nothing your competitors agree on that you&rsquo;re not already running. The log below shows the moment that changes.</p>
      </div>
    );
  }
  const [top, ...rest] = missing;
  return (
    <div className="bd-missing">
      <div className="rd-gap bd-missing__top">
        <span className="rd-kicker rd-kicker--gold">#1 · {top.label}</span>
        <div className="rd-gap__body">
          {top.kind !== "volume" && top.kind !== "pace" ? (
            <div className="rd-gap__ratio" aria-hidden="true">
              <b>{top.rivalsUsing}</b>
              <span>/{top.rivalsRead}</span>
              <small>competitors</small>
            </div>
          ) : null}
          <p className="rd-gap__headline">{top.headline}</p>
        </div>
        {top.example ? (
          <figure className="rd-gap__quote">
            <blockquote>&ldquo;{top.example.text}&rdquo;</blockquote>
            <figcaption>
              {top.example.advertiser} · still running after {days(top.example.runningDays)}
            </figcaption>
          </figure>
        ) : null}
        <p className="rd-fine">{top.detail}</p>
        <Link href="/app/picks" className="bd-act bd-act--dark">
          Brief the test that fills it →
        </Link>
      </div>
      {rest.length > 0 ? (
        <ol className="bd-missing__rest">
          {rest.map((m, i) => (
            <li key={m.id} className="bd-miss">
              <span className="bd-miss__n">#{i + 2}</span>
              <div className="bd-miss__body">
                <span className="bd-miss__label">{m.label}</span>
                <p className="bd-miss__headline">{m.headline}</p>
                {m.example ? (
                  <p className="rd-fine">
                    &ldquo;{m.example.text}&rdquo; · {m.example.advertiser}, {days(m.example.runningDays)}
                  </p>
                ) : (
                  <p className="rd-fine">{m.detail}</p>
                )}
              </div>
              {m.kind !== "volume" && m.kind !== "pace" ? <Ratio m={m} /> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function changeLine(c: Change): string {
  const who = c.you ? "You" : c.advertiser;
  if (c.kind === "launched") return `${who} launched ${c.count === 1 ? "a new ad" : `${c.count} new ads`}`;
  if (c.kind === "stopped") return `${who} stopped an ad${c.days !== null ? ` after ${days(c.days)}` : ""}`;
  return `${c.you ? "Your" : `${c.advertiser}'s`} ad crossed ${c.days} days`;
}

export function ChangeLog({ changes, historyDays, now }: { changes: Change[]; historyDays: number; now: Date }) {
  if (changes.length === 0) {
    return (
      <div className="bd-log bd-log--empty">
        <p className="rd-soft">
          {historyDays < 2
            ? "The log starts after the second daily read: that's when there's a yesterday to compare against."
            : "Quiet so far: nobody launched, stopped or crossed a milestone between reads."}
        </p>
      </div>
    );
  }
  return (
    <ol className="bd-log">
      {changes.slice(0, 40).map((c, i) => (
        <li key={i} className={`bd-log__item is-${c.kind}${c.you ? " is-you" : ""}`}>
          <span className="bd-log__when">{when(c.day, now)}</span>
          <i aria-hidden="true" />
          <div>
            <p className="bd-log__what">{changeLine(c)}</p>
            {c.text ? <p className="rd-fine">&ldquo;{c.text}&rdquo;</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Feed({ rival, now }: { rival: BoardRival; now: Date }) {
  const s = rival.summary;
  return (
    <article className="bd-feed">
      <header className="bd-feed__head">
        <span className={`bd-rec${s ? "" : " is-off"}`} aria-hidden="true" />
        <div className="bd-feed__who">
          <h3>{rival.name}</h3>
          <span className="rd-domain">{rival.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? "no site on file"}</span>
        </div>
        <span className="bd-feed__time">{rival.readAt ? ago(rival.readAt, now) : "first read pending"}</span>
      </header>
      {s ? (
        <>
          <div className="bd-feed__stats">
            <span>
              <b>{s.active}</b> live
            </span>
            <span>
              <b>{rival.launchedThisWeek ?? 0}</b> new this week
            </span>
            <span>
              <b>{s.longestDays ?? "–"}</b>
              {s.longestDays !== null ? "d" : ""} longest
            </span>
          </div>
          {rival.platforms && rival.platforms.length > 0 ? (
            <div className="bd-places">
              {rival.platforms.map((p) => (
                <span key={p}>{PLACEMENT[p] ?? p}</span>
              ))}
            </div>
          ) : null}
          {s.top[0] ? <AdCard ad={s.top[0]} advertiser={rival.name} /> : <p className="rd-soft">No live Meta ads right now.</p>}
        </>
      ) : (
        <p className="rd-soft bd-feed__pending">Reading their ads. The first read lands within the day.</p>
      )}
      <a className="bd-feed__more" href={libraryUrl(rival.name)} target="_blank" rel="noreferrer">
        All their ads in the Ad Library ↗
      </a>
    </article>
  );
}

export function YourAds({ board, name }: { board: Board; name: string }) {
  const you = board.you;
  if (!you) return <p className="rd-soft">Reading your live ads. The first read lands within the day.</p>;
  if (you.summary.active === 0) return <p className="rd-soft">No live Meta ads found for {name}. Everything your competitors run is a gap until you are.</p>;
  return (
    <div className="bd-yours">
      {you.summary.top.map((ad) => (
        <AdCard key={ad.id} ad={ad} advertiser={name} />
      ))}
    </div>
  );
}
