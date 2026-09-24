import type { ReadBrief } from "@/lib/read/brief";
import type { AdvertiserSummary, Gap, ReadAd } from "@/lib/read/gap";
import { OPENING_LABEL, type Opening } from "@/lib/read/labels";

/**
 * The pieces a category read is drawn with, shared by the live read and the
 * sample under the hero so the promise and the product look identical. Pure
 * markup: no state, no server imports.
 */

export const days = (n: number | null) => (n === null ? "start date unknown" : n === 1 ? "1 day" : `${n} days`);

const LONG = 21;

/** An ad the way it looks in a feed: who ran it, how long it has run, the words. */
export function AdCard({ ad, advertiser }: { ad: ReadAd; advertiser: string }) {
  const long = (ad.runningDays ?? 0) >= LONG;
  return (
    <a className="rd-ad" href={ad.url} target="_blank" rel="noreferrer">
      <div className="rd-ad__head">
        <span className="rd-ad__avatar" aria-hidden="true">
          {advertiser.slice(0, 1).toUpperCase()}
        </span>
        <span className="rd-ad__who">
          <b>{advertiser}</b>
          <span>Sponsored</span>
        </span>
        <span className={`rd-run${long ? " rd-run--long" : ""}`}>
          {long ? <i aria-hidden="true" /> : null}
          {days(ad.runningDays)}
        </span>
      </div>
      <p className="rd-ad__text">{ad.text || "Image or video only, no words to read."}</p>
      {ad.opening ? <span className="rd-tag">{OPENING_LABEL[ad.opening]}</span> : null}
    </a>
  );
}

export function Stats({ summary }: { summary: AdvertiserSummary }) {
  return (
    <div className="rd-stats">
      <span>
        <b>{summary.active}</b> live
      </span>
      <span>
        <b>{summary.stillRunning}</b> past 3 wks
      </span>
      {summary.longestDays !== null ? (
        <span>
          <b>{summary.longestDays}</b>d longest
        </span>
      ) : null}
    </div>
  );
}

function shares(s: Pick<AdvertiserSummary, "openings">[]): Partial<Record<Opening, number>> {
  const counts: Partial<Record<Opening, number>> = {};
  let total = 0;
  for (const x of s) {
    for (const [k, v] of Object.entries(x.openings) as [Opening, number][]) {
      counts[k] = (counts[k] ?? 0) + v;
      total += v;
    }
  }
  const out: Partial<Record<Opening, number>> = {};
  if (total === 0) return out;
  for (const [k, v] of Object.entries(counts) as [Opening, number][]) out[k] = v / total;
  return out;
}

/**
 * How the rivals' long-running ads open against how the brand's do, as a
 * share of each side's mix. The row the gap names is lit.
 */
export function OpeningMix({ own, rivals, highlight }: { own: AdvertiserSummary | null; rivals: AdvertiserSummary[]; highlight: Opening | null }) {
  const theirs = shares(rivals);
  const yours = own ? shares([own]) : {};
  const rows = (Object.keys(OPENING_LABEL) as Opening[])
    .filter((o) => (theirs[o] ?? 0) > 0 || (yours[o] ?? 0) > 0)
    .sort((a, b) => (theirs[b] ?? 0) - (theirs[a] ?? 0) || (yours[b] ?? 0) - (yours[a] ?? 0));
  if (rows.length === 0) return null;
  const pct = (n: number | undefined) => Math.round((n ?? 0) * 100);
  return (
    <div className="rd-mix">
      <div className="rd-mix__legend">
        <span>
          <i className="rd-sw rd-sw--them" /> Rivals
        </span>
        <span>
          <i className="rd-sw rd-sw--you" /> You
        </span>
      </div>
      {rows.map((o) => (
        <div key={o} className={`rd-mix__row${o === highlight ? " is-gap" : ""}`}>
          <span className="rd-mix__label">{OPENING_LABEL[o]}</span>
          <div className="rd-mix__bars">
            <div className="rd-bar">
              <span className="rd-bar__track">
                <span className="rd-bar__fill rd-bar__fill--them" style={{ width: `${Math.max(pct(theirs[o]), 1)}%` }} />
              </span>
              <em>{pct(theirs[o])}%</em>
            </div>
            <div className="rd-bar">
              <span className="rd-bar__track">
                <span className="rd-bar__fill rd-bar__fill--you" style={{ width: `${Math.max(pct(yours[o]), 1)}%` }} />
              </span>
              <em>{own ? `${pct(yours[o])}%` : "—"}</em>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GapCard({ gap }: { gap: Gap }) {
  const showRatio = gap.opening && gap.rivalsRead > 0 && gap.kind !== "none";
  return (
    <div className="rd-gap">
      <div className="rd-gap__glow" aria-hidden="true" />
      <span className="rd-kicker rd-kicker--gold">The gap</span>
      <div className="rd-gap__body">
        {showRatio ? (
          <div className="rd-gap__ratio" aria-hidden="true">
            <b>{gap.rivalsUsing}</b>
            <span>/{gap.rivalsRead}</span>
            <small>rivals</small>
          </div>
        ) : null}
        <p className="rd-gap__headline">{gap.headline}</p>
      </div>
      {gap.example ? (
        <figure className="rd-gap__quote">
          <blockquote>&ldquo;{gap.example.text}&rdquo;</blockquote>
          <figcaption>
            {gap.example.advertiser} · still running after {days(gap.example.runningDays)}
          </figcaption>
        </figure>
      ) : null}
      <p className="rd-fine">{gap.limit}</p>
    </div>
  );
}

/** The brief as a creator would shoot it: three frames, then the why. */
export function BriefBoard({ brief }: { brief: ReadBrief }) {
  return (
    <div className="rd-brief">
      <div className="rd-brief__top">
        <div>
          <span className="rd-kicker">Your first test · {brief.product}</span>
          <h3>{brief.title}</h3>
        </div>
      </div>
      <blockquote className="rd-hook">
        <span>The hook, word for word</span>
        &ldquo;{brief.hook}&rdquo;
      </blockquote>
      <div className="rd-board">
        {brief.beats.map((b) => (
          <div key={b.at} className="rd-frame">
            <div className="rd-phone">
              <span className="rd-phone__at">{b.at}</span>
              <p className="rd-frame__see">{b.see}</p>
              {b.onScreen && b.onScreen !== "none" ? <span className="rd-phone__caption">{b.onScreen}</span> : null}
            </div>
            {b.say && b.say !== "none" ? <p className="rd-frame__say">&ldquo;{b.say}&rdquo;</p> : null}
          </div>
        ))}
      </div>
      <div className="rd-brief__foot">
        <p>
          <b>Hypothesis.</b> {brief.hypothesis}
        </p>
        <p className="rd-fine">
          {brief.because}
          {brief.hook.includes("[") ? " The bracketed parts are yours to fill." : ""}
        </p>
      </div>
    </div>
  );
}
