"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import SubmitButton from "@/components/app/submit-button";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { checkCreatorAction, saveLeadAction, type LeadState } from "@/lib/creator/actions";
import { gapLine, type Benchmark } from "@/lib/creator/benchmark";
import type { CreatorCheck } from "@/lib/creator/check";
import { CREATOR_PRICE } from "@/lib/creator/funnel";
import type { CreatorRead } from "@/lib/creator/read";
import { theirs, type CreatorStats, type ScoredPost } from "@/lib/creator/stats";
import { compact, percent } from "@/lib/format";

import ShareBar from "./share";
import DiagnosisCard from "./diagnosis-card";
import { PostBars, TierLegend, useReplay } from "./visuals";

/** What the check is doing, by the second it usually gets there. The read is one call, so this is a clock, not a signal. */
const STEPS = [
  { at: 0, label: (h: string) => `Reading @${h}'s last 12 posts` },
  { at: 20, label: () => "Measuring each one against your usual" },
  { at: 35, label: () => "Pulling the top posts in your niche" },
  { at: 70, label: () => "Comparing you with the creators beating you" },
  { at: 95, label: () => "Writing what to post instead" },
];

function Working() {
  const { pending, data } = useFormStatus();
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!pending) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pending]);
  if (!pending) return null;
  const handle = String(data?.get("handle") ?? "").replace(/^@/, "") || "you";
  const current = STEPS.filter((s) => s.at <= seconds).length - 1;
  return (
    <div className="card mt-4 p-4 text-left">
      <ul className="list-none m-0 p-0 flex flex-col gap-2.5 text-[13.5px]">
        {STEPS.map((step, i) => (
          <li key={step.at} className={`flex items-center gap-2.5 ${i > current ? "text-ink-3" : ""}`}>
            {i < current ? (
              <span className="w-3.5 h-3.5 rounded-full bg-ink text-bg grid place-items-center text-[9px]">✓</span>
            ) : i === current ? (
              <span className="spinner" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-line-strong" />
            )}
            {step.label(handle)}
          </li>
        ))}
      </ul>
      <p className="caption mt-3">Usually one to two minutes.</p>
    </div>
  );
}


/** A hook, with a copy button: creators paste it straight into their notes. */
function HookCard({ hook, why, n }: { hook: string; why: string; n: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="card p-5 rise flex flex-col gap-3" style={{ animationDelay: `${380 + n * 110}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium text-brand">Hook {n + 1}</span>
        <button
          type="button"
          className="text-[12px] text-ink-3 hover:text-ink"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(hook);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              window.prompt("Copy the hook:", hook);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.015em]">&ldquo;{hook}&rdquo;</p>
      <p className="m-0 text-[13px] text-ink-2 leading-[1.5]">{why}</p>
    </li>
  );
}

/** Why the posts flop, what the hits did right, and (for the creator themself) the fix. Flops first: that's the sell. */
/** The creators beating them in their niche: the gap, what the top does differently, and who is winning. */
export function NicheSection({ b, lines, voice = "you" }: { b: Benchmark; lines?: string[]; voice?: "you" | "they" }) {
  const say = (t: string) => (voice === "you" ? t : theirs(t));
  return (
    <section className="rise" style={{ animationDelay: "250ms" }}>
      <p className="text-[13px] font-medium text-neg m-0">Against the top of #{b.tag}</p>
      <p className="m-0 mt-2 text-[24px] sm:text-[28px] leading-[1.2] font-semibold tracking-[-0.025em]">{gapLine(b, voice === "you" ? "your" : "their")}</p>
      {lines && lines.length > 0 && (
        <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-2 text-[14.5px] text-ink-2 leading-[1.55]">
          {lines.map((x) => (
            <li key={x} className="flex gap-2.5">
              <span className="w-2 h-2 rounded-full bg-pos mt-[8px] shrink-0" />
              {say(x)}
            </li>
          ))}
        </ul>
      )}
      <div className="card mt-5 divide-y divide-line">
        <div className="px-4 py-2.5 text-[12px] text-ink-3 flex justify-between">
          <span>Who&apos;s winning #{b.tag} right now</span>
          <span>vs. {voice === "you" ? "your" : "their"} usual</span>
        </div>
        {b.posts.slice(0, 5).map((p) => (
          <a key={p.handle} href={p.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
            <span className="w-8 h-8 rounded-full bg-ink text-bg grid place-items-center text-[13px] font-semibold shrink-0">{p.handle.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium truncate">
                @{p.handle}
                {p.followers ? <span className="text-ink-3 font-normal"> · {compact(p.followers)}</span> : null}
              </span>
              <span className="block text-[13px] text-ink-2 truncate">&ldquo;{p.caption ?? "No caption"}&rdquo;</span>
            </span>
            <span className="text-[15px] font-semibold tnum shrink-0">{p.timesYou}×</span>
          </a>
        ))}
      </div>
      <p className="caption mt-2 mb-0">The top posts {b.platform === "tiktok" ? "TikTok" : "Instagram"} shows for #{b.tag}, the best of each creator. Likes, comments and shares.</p>
    </section>
  );
}

export function ReadSection({ read, voice = "you", hooks = true, benchmark }: { read: CreatorRead; voice?: "you" | "they"; hooks?: boolean; benchmark?: Benchmark | null }) {
  const say = (t: string) => (voice === "you" ? t : theirs(t));
  return (
    <div className="flex flex-col gap-8">
      <section className="rise" style={{ animationDelay: "150ms" }}>
        <p className="text-[13px] font-medium text-neg m-0">Why {voice === "you" ? "your" : "their"} posts flop</p>
        <p className="m-0 mt-2 text-[24px] sm:text-[28px] leading-[1.2] font-semibold tracking-[-0.025em]">{say(read.verdict)}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 gap-x-8 gap-y-5 mt-6">
          {[
            { title: voice === "you" ? "What's wrong with your flops" : "What's wrong with the flops", items: read.stalled_share, dot: "bg-neg" },
            { title: voice === "you" ? "What your hits got right" : "What the hits got right", items: read.breakouts_share, dot: "bg-pos" },
          ].map((col) => (
            <div key={col.title}>
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                {col.title}
              </div>
              <ul className="list-none p-0 m-0 mt-2.5 flex flex-col gap-2 text-[14.5px] text-ink-2 leading-[1.55]">
                {(col.items.length ? col.items : ["Nothing stood out in these posts."]).map((x) => (
                  <li key={x}>{say(x)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[10px] bg-neg-bg px-4 py-3 text-[14.5px] leading-[1.5]">
          <span className="font-semibold text-neg">Stop doing this: </span>
          {say(read.stop)}
        </div>
      </section>
      {benchmark && <NicheSection b={benchmark} lines={read.vs_niche} voice={voice} />}
      {hooks && (
        <section>
          <p className="text-[13px] font-medium text-pos m-0">The fix: post these next</p>
          <ol className="list-none p-0 m-0 mt-3 grid grid-cols-[minmax(0,1fr)] gap-3">
            {read.next_hooks.map((h, n) => (
              <HookCard key={h.hook} hook={h.hook} why={h.why} n={n} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const TIER_BADGE: Record<ScoredPost["tier"], React.ReactNode> = {
  breakout: <span className="badge badge-pos">Broke out</span>,
  typical: <span className="badge badge-outline">Usual</span>,
  stalled: <span className="badge badge-neg">Stalled</span>,
};

/** The numbers behind the type, folded away: the chart, the three figures, every post. */
export function Numbers({ stats, headline }: { stats: CreatorStats; headline?: string }) {
  return (
    <details className="card group">
      <summary className="flex items-center justify-between px-5 py-4 text-[14px] font-medium">
        See the numbers
        <span className="text-ink-3 text-[18px] leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-line p-5 flex flex-col gap-5">
        {headline && <p className="m-0 text-[14.5px] leading-[1.55]">{headline}</p>}
        <PostBars posts={stats.posts} height={150} />
        <TierLegend />
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Usual post", value: compact(stats.medianInteractions), note: "likes + comments + shares" },
            { label: "Best post", value: `${stats.bestMultiple}×`, note: "the usual" },
            { label: "Carried by", value: percent(stats.topShare, 0), note: "of engagement from the top fifth" },
          ].map((k) => (
            <div key={k.label} className="well p-3">
              <div className="text-[12px] text-ink-2">{k.label}</div>
              <div className="text-[20px] font-semibold tnum mt-0.5">{k.value}</div>
              <div className="caption leading-[1.35]">{k.note}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto -mx-5 border-t border-line">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="text-left">Post</th>
                <th className="text-right">vs. usual</th>
                <th className="text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {stats.posts.map((p, i) => (
                <tr key={p.url ?? i}>
                  <td className="max-w-[150px] sm:max-w-[360px]">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                        {p.caption ?? "No caption"}
                      </a>
                    ) : (
                      <div className="truncate">{p.caption ?? "No caption"}</div>
                    )}
                  </td>
                  <td className="text-right tnum">{p.multiple}×</td>
                  <td>{TIER_BADGE[p.tier]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function Upgrade({ href }: { href: string }) {
  return (
    <section className="card mt-12 p-6 sm:p-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8 items-center">
      <div>
        <p className="kicker">Creator plan</p>
        <h3 className="heading text-[22px] mt-2">This was 12 of your posts, once. TRND reads your niche every day.</h3>
        <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-3">
          Pick up to 10 creators you compete with. When one of their posts breaks out, you see it the next morning: the hook, the format, how far past their
          usual it went, and a hook of your own to answer it.
        </p>
        <ul className="list-none p-0 m-0 mt-5 flex flex-col gap-2.5">
          {["Up to 10 creators, read daily", "Their breakouts, as they happen", "Your posts measured the same way, every week", "Three hooks a week built on what's working now"].map((x) => (
            <li key={x} className="flex gap-2.5 text-[14px]">
              <IconCheck className="text-brand mt-[3px] shrink-0" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <div className="well p-6 text-center">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="display text-[40px] tnum">{CREATOR_PRICE}</span>
          <span className="text-ink-3 text-[14px]">per month</span>
        </div>
        <p className="caption mt-1">First month free. Cancel any time.</p>
        <a href={href} className="btn btn-primary btn-lg w-full mt-5">
          Start free <IconArrowRight />
        </a>
      </div>
    </section>
  );
}

function Result({ r }: { r: CreatorCheck }) {
  const s = r.stats!;
  const [run, replay] = useReplay();
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [r.id, r.handle]);
  const signup = `/creators/start?handle=${encodeURIComponent(r.handle ?? "")}&platform=${r.platform}${r.src ? `&src=${encodeURIComponent(r.src)}` : ""}`;
  return (
    <div ref={top} className="mt-14 text-left scroll-mt-20">
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
        <div className="lg:sticky lg:top-20 flex flex-col gap-4">
          <DiagnosisCard handle={r.handle ?? ""} platform={r.platform ?? "tiktok"} followers={r.followers} stats={s} killer={r.read?.killer} fix={r.read?.next_hooks[0]?.hook} benchmark={r.benchmark} run={run} />
          {r.id ? (
            <ShareBar id={r.id} handle={r.handle ?? ""} onReplay={replay} />
          ) : (
            <button type="button" className="btn btn-ghost self-start" onClick={replay}>
              Replay
            </button>
          )}
        </div>
        <div className="flex flex-col gap-8">
          {r.read ? (
            <ReadSection read={r.read} benchmark={r.benchmark} />
          ) : (
            <>
              <p className="text-[15px] text-ink-2 m-0">The written read is unavailable right now. Run the check again in a minute for why your posts flop and what to post instead.</p>
              {r.benchmark && <NicheSection b={r.benchmark} />}
            </>
          )}
          <Numbers stats={s} headline={r.headline} />
        </div>
      </div>

      <Recheck r={r} />
      <Upgrade href={signup} />
    </div>
  );
}

/** The free follow-up: the same check by email every week. The list the plan is sold to. */
function Recheck({ r }: { r: CreatorCheck }) {
  const [state, action] = useActionState<LeadState, FormData>(saveLeadAction, {});
  if (state.saved) {
    return (
      <div className="well px-4 py-3 mt-10 text-[14px] flex items-center gap-2.5">
        <IconCheck className="text-brand shrink-0" />
        Done. We&apos;ll check @{r.handle} again in a week and email you what changed.
      </div>
    );
  }
  return (
    <form action={action} className="card p-5 mt-10 grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-center">
      <div>
        <div className="text-[15px] font-semibold">Re-check my posts next week</div>
        <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">The same check a week from now, then every week, with three new hooks. Free. Unsubscribe in one click.</p>
      </div>
      <div>
        <input type="hidden" name="handle" value={r.handle ?? ""} />
        <input type="hidden" name="platform" value={r.platform ?? "tiktok"} />
        <input type="hidden" name="niche" value={r.niche ?? ""} />
        <input type="hidden" name="src" value={r.src ?? ""} />
        <div className="flex gap-2">
          <input name="email" type="email" required className="input" placeholder="you@example.com" aria-label="Your email" autoComplete="email" />
          <SubmitButton className="btn btn-secondary shrink-0" pending="Saving…">
            Email me
          </SubmitButton>
        </div>
        {state.error && <p className="form-error mt-2 mb-0">{state.error}</p>}
      </div>
    </form>
  );
}

/** The check's form and, once it has run, the result. `sample` shows in the result's place until then. */
export default function CreatorCheckForm({ src = "", handle = "", platform = "tiktok", sample }: { src?: string; handle?: string; platform?: "tiktok" | "instagram"; sample?: React.ReactNode }) {
  const [state, action] = useActionState<CreatorCheck, FormData>(checkCreatorAction, {});
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    // A handle in the link: run the check once, as if the visitor had pressed the button.
    if (handle && !started.current) {
      started.current = true;
      form.current?.requestSubmit();
    }
  }, [handle]);
  return (
    <>
      <form ref={form} action={action} className="w-full max-w-[560px] mx-auto">
        <div className="sitebox">
          <select name="platform" defaultValue={state.platform ?? platform} aria-label="Platform" className="bg-transparent text-[14px] text-ink-2 outline-none border-0 pr-1">
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
          <span className="w-px h-5 bg-line-strong" aria-hidden />
          <input type="hidden" name="src" value={state.src ?? src} />
          <input name="handle" defaultValue={state.handle ? `@${state.handle}` : handle ? `@${handle.replace(/^@/, "")}` : ""} placeholder="@yourhandle" aria-label="Your handle" autoComplete="off" required />
          <SubmitButton className="btn btn-primary" pending="Reading…">
            Check my posts
          </SubmitButton>
        </div>
        <input
          name="niche"
          defaultValue={state.niche ?? ""}
          className="input mt-2.5"
          placeholder="Your niche, e.g. home workouts. We measure you against the top creators in it"
          aria-label="Your niche"
          maxLength={80}
        />
        <p className="caption mt-3 text-center">Public posts only. We never ask for your login.</p>
        {state.error && <p className="form-error mt-3">{state.error}</p>}
        <Working />
      </form>
      {state.stats ? <Result r={state} /> : !handle && sample}
    </>
  );
}
