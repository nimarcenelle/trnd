"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import PilotForm from "@/components/landing/pilot-form";
import type { ReadBrief } from "@/lib/read/brief";
import type { AdvertiserSummary, Gap, ReadAd } from "@/lib/read/gap";
import { OPENING_LABEL } from "@/lib/read/labels";
import type { ReadBrand, ReadEvent, ReadRival } from "@/lib/read/run";

/**
 * The landing page's one input. A store's address goes in; the read
 * streams back and each section fills in the moment its stage lands, so
 * the minute it takes is spent watching the brand's category appear
 * rather than a spinner.
 */

type Phase = "idle" | "running" | "done" | "error";

interface ReadState {
  status: string | null;
  brand: ReadBrand | null;
  rivals: ReadRival[] | null;
  own: AdvertiserSummary | null;
  ownFailed: boolean;
  rivalReads: Record<string, AdvertiserSummary>;
  rivalFailed: string[];
  gap: Gap | null;
  brief: ReadBrief | null;
  example: boolean;
  error: string | null;
}

const EMPTY: ReadState = {
  status: null,
  brand: null,
  rivals: null,
  own: null,
  ownFailed: false,
  rivalReads: {},
  rivalFailed: [],
  gap: null,
  brief: null,
  example: false,
  error: null,
};

function reduce(s: ReadState, e: ReadEvent): ReadState {
  switch (e.type) {
    case "status":
      return { ...s, status: e.label, example: s.example || e.label.startsWith("No live keys") };
    case "brand":
      return { ...s, brand: e.brand };
    case "rivals":
      return { ...s, rivals: e.rivals };
    case "advertiser":
      return e.role === "brand" ? { ...s, own: e.summary } : { ...s, rivalReads: { ...s.rivalReads, [e.summary.name]: e.summary } };
    case "advertiser_failed":
      return e.role === "brand" ? { ...s, ownFailed: true } : { ...s, rivalFailed: [...s.rivalFailed, e.name] };
    case "gap":
      return { ...s, gap: e.gap };
    case "brief":
      return { ...s, brief: e.brief };
    case "done":
      return { ...s, status: null, example: e.example };
    case "error":
      return { ...s, error: e.reason, status: null };
  }
}

const days = (n: number | null) => (n === null ? "start date unknown" : n === 1 ? "1 day" : `${n} days`);

export default function CategoryRead({ gated }: { gated: boolean }) {
  const [website, setWebsite] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [read, setRead] = useState<ReadState>(EMPTY);
  const [applying, setApplying] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!website.trim() || phase === "running") return;
    setPhase("running");
    setRead(EMPTY);
    setApplying(false);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    let state = EMPTY;
    const apply = (event: ReadEvent) => {
      state = reduce(state, event);
      setRead(state);
    };
    try {
      const res = await fetch("/api/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website }),
      });
      if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        apply({ type: "error", reason: body?.reason ?? "The read failed. Try again in a minute." });
        setPhase("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as ReadEvent);
      }
      if (buffer.trim()) apply(JSON.parse(buffer) as ReadEvent);
      setPhase(state.error ? "error" : "done");
    } catch {
      apply({ type: "error", reason: "The connection dropped. Try again." });
      setPhase("error");
    }
  }

  const started = phase !== "idle";
  const rivalsPending = read.rivals?.filter((r) => !read.rivalReads[r.name] && !read.rivalFailed.includes(r.name)) ?? [];

  return (
    <>
      <form className="read-form" onSubmit={start}>
        <label htmlFor="read-site" className="sr-only">
          Your store&rsquo;s address
        </label>
        <input
          id="read-site"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yourbrand.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={phase === "running"}
        />
        <button type="submit" className="btn btn-primary" disabled={phase === "running" || !website.trim()}>
          {phase === "running" ? "Reading…" : phase === "idle" ? "Read my category" : "Read again"}
        </button>
      </form>
      <p className="read-form__note">Free, no account. About a minute. We read your site and the public Meta Ad Library, nothing else.</p>

      <div ref={resultsRef} className="read-results" aria-live="polite">
        {!started ? null : (
          <>
            {read.status ? (
              <div className="read-status" role="status">
                <span className="read-status__dot" aria-hidden="true" />
                {read.status}
              </div>
            ) : null}
            {read.error ? <div className="read-error">{read.error}</div> : null}
            {read.example ? (
              <div className="read-example">
                <strong>Example read.</strong> This install has no live keys, so this is an invented brand and invented rivals run through
                the real arithmetic. With keys set, it reads the address you typed.
              </div>
            ) : null}

            {read.brand ? (
              <section className="read-section">
                <div className="read-section__head">
                  <span className="eyebrow">01 · What you&rsquo;re running</span>
                  <h2>{read.brand.name}</h2>
                  <p className="read-muted">
                    {read.brand.category}
                    {read.brand.products.length ? ` · ${read.brand.products.slice(0, 3).map((p) => p.name).join(", ")}` : ""}
                  </p>
                </div>
                {read.own ? (
                  <AdvertiserCard summary={read.own} own />
                ) : read.ownFailed ? (
                  <div className="read-card read-muted">We couldn&rsquo;t reach the Ad Library for {read.brand.name}. The rest of the read goes on.</div>
                ) : (
                  <div className="read-card read-skeleton" aria-hidden="true" />
                )}
              </section>
            ) : null}

            {read.rivals ? (
              <section className="read-section">
                <div className="read-section__head">
                  <span className="eyebrow">02 · What your rivals keep paying for</span>
                  <h2>{read.rivals.length === 0 ? "We couldn't name your rivals" : "Their longest-running ads"}</h2>
                  <p className="read-muted">
                    {read.rivals.length === 0
                      ? "None of the brands we'd name had a site we could load. Sign up and add them yourself."
                      : "An ad still running after three weeks is one its brand keeps paying for."}
                  </p>
                </div>
                <div className="read-grid">
                  {read.rivals.map((r) =>
                    read.rivalReads[r.name] ? (
                      <AdvertiserCard key={r.domain} summary={read.rivalReads[r.name]} why={r.why} />
                    ) : read.rivalFailed.includes(r.name) ? (
                      <div key={r.domain} className="read-card">
                        <h3>{r.name}</h3>
                        <p className="read-muted">The Ad Library didn&rsquo;t answer for {r.name}.</p>
                      </div>
                    ) : (
                      <div key={r.domain} className="read-card read-skeleton">
                        <h3>{r.name}</h3>
                        <p className="read-muted">Reading their live ads…</p>
                      </div>
                    ),
                  )}
                </div>
                {rivalsPending.length > 0 ? <span className="sr-only">{rivalsPending.length} rivals still loading</span> : null}
              </section>
            ) : null}

            {read.gap ? (
              <section className="read-section read-gap">
                <span className="eyebrow">03 · The gap</span>
                <p className="read-gap__headline">{read.gap.headline}</p>
                {read.gap.example ? (
                  <figure className="read-gap__example">
                    <blockquote>&ldquo;{read.gap.example.text}&rdquo;</blockquote>
                    <figcaption>
                      {read.gap.example.advertiser}, still running after {days(read.gap.example.runningDays)}
                    </figcaption>
                  </figure>
                ) : null}
                <p className="read-limit">{read.gap.limit}</p>
              </section>
            ) : null}

            {read.brief ? <BriefCard brief={read.brief} /> : null}

            {phase === "done" && read.gap ? (
              <section className="read-cta">
                <h2>Get three of these every Monday.</h2>
                <p>
                  TRND reads your category every week, writes the tests worth running with the evidence behind each one, checks the
                  finished ad against its brief, and keeps score of what won.
                </p>
                {gated ? (
                  applying ? (
                    <div className="read-apply">
                      <PilotForm />
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => setApplying(true)}>
                      Apply for the pilot
                    </button>
                  )
                ) : (
                  <Link href="/signup" className="btn btn-primary">
                    Get my first week
                  </Link>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function AdLine({ ad }: { ad: ReadAd }) {
  return (
    <li className="read-ad">
      <div className="read-ad__meta">
        <span className={`read-days${(ad.runningDays ?? 0) >= 21 ? " read-days--long" : ""}`}>{days(ad.runningDays)}</span>
        {ad.opening ? <span className="read-chip">{OPENING_LABEL[ad.opening]}</span> : null}
      </div>
      <a href={ad.url} target="_blank" rel="noreferrer" className="read-ad__text">
        {ad.text || "Image or video only, no words to read"}
      </a>
    </li>
  );
}

function AdvertiserCard({ summary, why, own = false }: { summary: AdvertiserSummary; why?: string; own?: boolean }) {
  if (summary.active === 0) {
    return (
      <div className="read-card">
        {own ? null : <h3>{summary.name}</h3>}
        <p className="read-muted">{own ? "No live Meta ads found. The gap below is the opening to enter with." : "No live Meta ads right now."}</p>
      </div>
    );
  }
  return (
    <div className="read-card">
      {own ? null : (
        <>
          <h3>{summary.name}</h3>
          {why ? <p className="read-muted read-why">{why}</p> : null}
        </>
      )}
      <div className="read-stats">
        <span>
          <b>{summary.active}</b> live
        </span>
        <span>
          <b>{summary.stillRunning}</b> past 3 weeks
        </span>
        {summary.longestDays !== null ? (
          <span>
            longest <b>{summary.longestDays}</b> days
          </span>
        ) : null}
      </div>
      <ul className="read-ads">
        {summary.top.slice(0, own ? 3 : 2).map((ad) => (
          <AdLine key={ad.id} ad={ad} />
        ))}
      </ul>
      {own && summary.stillRunning > 0 ? (
        <p className="read-muted read-own-note">
          {summary.stillRunning === 1 ? "One ad has" : `${summary.stillRunning} ads have`} run past three weeks. You&rsquo;re still paying for
          {summary.stillRunning === 1 ? " it" : " them"}, so you know better than we do whether that&rsquo;s because {summary.stillRunning === 1 ? "it works" : "they work"}.
        </p>
      ) : null}
    </div>
  );
}

function BriefCard({ brief }: { brief: ReadBrief }) {
  return (
    <section className="read-section read-brief">
      <span className="eyebrow">04 · Your first test</span>
      <h2>{brief.title}</h2>
      <p className="read-muted">On {brief.product}</p>
      <p className="read-brief__hyp">{brief.hypothesis}</p>
      <div className="read-brief__hook">
        <span className="mono-label">The hook, word for word</span>
        <p>&ldquo;{brief.hook}&rdquo;</p>
      </div>
      <div className="read-beats">
        <span className="mono-label">The first three seconds</span>
        {brief.beats.map((b) => (
          <div key={b.at} className="read-beat">
            <span className="read-beat__at">{b.at}</span>
            <div>
              <p>{b.see}</p>
              {b.onScreen && b.onScreen !== "none" ? <p className="read-muted">On screen: {b.onScreen}</p> : null}
              {b.say && b.say !== "none" ? <p className="read-muted">Said: &ldquo;{b.say}&rdquo;</p> : null}
            </div>
          </div>
        ))}
      </div>
      <p className="read-limit">
        Why this test: {brief.because}
        {brief.hook.includes("[") ? " The bracketed parts are yours to fill." : ""}
      </p>
    </section>
  );
}
