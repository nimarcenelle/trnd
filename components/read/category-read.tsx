"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import PilotForm from "@/components/landing/pilot-form";
import type { ReadBrief } from "@/lib/read/brief";
import type { AdvertiserSummary, Gap } from "@/lib/read/gap";
import type { ReadBrand, ReadEvent, ReadRival } from "@/lib/read/run";

import { AdCard, BriefBoard, GapCard, OpeningMix, Stats } from "./parts";

/**
 * The landing page's one input. A store's address goes in; the read
 * streams back and each section fills in the moment its stage lands, so
 * the minute it takes is spent watching the brand's category appear
 * rather than a spinner. Before anything is typed, `sample` (the sample
 * read) sits where the results will.
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

type StepState = "done" | "active" | "todo";

function steps(r: ReadState, phase: Phase): { label: string; state: StepState }[] {
  const rivalsIn = r.rivals !== null && r.rivals.every((x) => r.rivalReads[x.name] || r.rivalFailed.includes(x.name));
  const done = [
    r.brand !== null,
    r.rivals !== null,
    r.own !== null || r.ownFailed,
    rivalsIn,
    r.gap !== null,
    r.brief !== null || (phase === "done" && r.gap !== null),
  ];
  const labels = ["Your site", "Your rivals", "Your ads", "Their ads", "The gap", "Your test"];
  const firstOpen = done.findIndex((d) => !d);
  return labels.map((label, i) => ({
    label,
    state: done[i] ? "done" : i === firstOpen && phase === "running" ? "active" : "todo",
  }));
}

export default function CategoryRead({ gated, sample }: { gated: boolean; sample?: ReactNode }) {
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
  const rivalSummaries = (read.rivals ?? []).map((r) => read.rivalReads[r.name]).filter((s): s is AdvertiserSummary => Boolean(s));

  return (
    <>
      <form className="rd-command" onSubmit={start}>
        <span className="rd-command__prefix" aria-hidden="true">
          https://
        </span>
        <label htmlFor="read-site" className="sr-only">
          Your store&rsquo;s address
        </label>
        <input
          id="read-site"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="yourbrand.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={phase === "running"}
        />
        <button type="submit" className="rd-btn rd-btn--gold" disabled={phase === "running" || !website.trim()}>
          {phase === "running" ? (
            <>
              <span className="rd-spin" aria-hidden="true" /> Reading
            </>
          ) : phase === "idle" ? (
            <>Read my category →</>
          ) : (
            <>Read another →</>
          )}
        </button>
      </form>
      <ul className="rd-trust">
        <li>No login</li>
        <li>No ad account</li>
        <li>Public data only</li>
        <li>~60 seconds</li>
      </ul>

      <div ref={resultsRef} className="rd-results" aria-live="polite">
        {!started ? (
          sample ?? null
        ) : (
          <>
            <ol className="rd-rail">
              {steps(read, phase).map((s) => (
                <li key={s.label} className={`is-${s.state}`}>
                  <i aria-hidden="true" />
                  {s.label}
                </li>
              ))}
            </ol>
            {read.status ? (
              <p className="rd-status" role="status">
                {read.status}
              </p>
            ) : null}
            {read.error ? <div className="rd-alert rd-alert--error">{read.error}</div> : null}
            {read.example ? (
              <div className="rd-alert">
                <b>Example read.</b> This deployment has no live keys, so this is an invented brand and invented rivals run through the real
                arithmetic. With keys set, it reads the address you typed.
              </div>
            ) : null}

            {read.brand ? (
              <section className="rd-panel rd-in">
                <div className="rd-panel__head">
                  <div>
                    <span className="rd-kicker">What you&rsquo;re running</span>
                    <h2>{read.brand.name}</h2>
                    <p className="rd-soft">{read.brand.category}</p>
                  </div>
                  {read.own && read.own.active > 0 ? <Stats summary={read.own} /> : null}
                </div>
                {read.own ? (
                  read.own.active === 0 ? (
                    <p className="rd-soft">No live Meta ads found. The gap below is the opening to enter with.</p>
                  ) : (
                    <>
                      <div className="rd-ads">
                        {read.own.top.map((ad) => (
                          <AdCard key={ad.id} ad={ad} advertiser={read.own!.name} />
                        ))}
                      </div>
                      {read.own.stillRunning > 0 ? (
                        <p className="rd-fine rd-note">
                          {read.own.stillRunning === 1 ? "One ad has" : `${read.own.stillRunning} ads have`} run past three weeks. You&rsquo;re
                          still paying for {read.own.stillRunning === 1 ? "it" : "them"}, so you know better than we do whether that&rsquo;s because{" "}
                          {read.own.stillRunning === 1 ? "it works" : "they work"}.
                        </p>
                      ) : null}
                    </>
                  )
                ) : read.ownFailed ? (
                  <p className="rd-soft">We couldn&rsquo;t reach the Ad Library for {read.brand.name}. The rest of the read goes on.</p>
                ) : (
                  <div className="rd-ads">
                    <div className="rd-ad rd-skel" />
                    <div className="rd-ad rd-skel" />
                    <div className="rd-ad rd-skel" />
                  </div>
                )}
              </section>
            ) : null}

            {read.rivals ? (
              <section className="rd-panel rd-in">
                <div className="rd-panel__head">
                  <div>
                    <span className="rd-kicker">What your rivals keep paying for</span>
                    <h2>{read.rivals.length === 0 ? "We couldn't name your rivals" : "Their longest-running ads"}</h2>
                    <p className="rd-soft">
                      {read.rivals.length === 0
                        ? "None of the brands we'd name had a site we could load. Sign up and add them yourself."
                        : "An ad still running after three weeks is one its brand keeps paying for."}
                    </p>
                  </div>
                </div>
                <div className="rd-rivals">
                  {read.rivals.map((r) => {
                    const s = read.rivalReads[r.name];
                    return (
                      <div key={r.domain} className="rd-rival">
                        <div className="rd-rival__head">
                          <div>
                            <h3>{r.name}</h3>
                            <span className="rd-domain">{r.domain}</span>
                          </div>
                          {s && s.active > 0 ? <Stats summary={s} /> : null}
                        </div>
                        {r.why ? <p className="rd-soft rd-why">{r.why}</p> : null}
                        {s ? (
                          s.active === 0 ? (
                            <p className="rd-soft">No live Meta ads right now.</p>
                          ) : (
                            s.top.slice(0, 2).map((ad) => <AdCard key={ad.id} ad={ad} advertiser={r.name} />)
                          )
                        ) : read.rivalFailed.includes(r.name) ? (
                          <p className="rd-soft">The Ad Library didn&rsquo;t answer for {r.name}.</p>
                        ) : (
                          <div className="rd-ad rd-skel" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {read.gap ? (
              <section className="rd-in rd-gap-wrap">
                <GapCard gap={read.gap} />
                <div className="rd-panel">
                  <span className="rd-kicker">How the ads open, you against them</span>
                  <OpeningMix own={read.own} rivals={rivalSummaries} highlight={read.gap.opening} />
                </div>
              </section>
            ) : null}

            {read.brief ? (
              <section className="rd-in">
                <BriefBoard brief={read.brief} />
              </section>
            ) : null}

            {phase === "done" && read.gap ? (
              <section className="rd-close rd-in">
                <span className="rd-kicker rd-kicker--gold">That was one test</span>
                <h2>
                  Get three every Monday. <em>Know which one won.</em>
                </h2>
                <p>
                  TRND reads your category every week, writes the tests worth running with the evidence behind each one, checks the finished
                  ad against its brief, and keeps score of what won.
                </p>
                {gated ? (
                  applying ? (
                    <div className="rd-apply">
                      <PilotForm />
                    </div>
                  ) : (
                    <button type="button" className="rd-btn rd-btn--gold rd-btn--lg" onClick={() => setApplying(true)}>
                      Apply for the pilot →
                    </button>
                  )
                ) : (
                  <Link href="/signup" className="rd-btn rd-btn--gold rd-btn--lg">
                    Get my first week →
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
