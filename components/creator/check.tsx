"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import SubmitButton from "@/components/app/submit-button";
import { IconArrowRight, IconArrowUpRight, IconCheck } from "@/components/icons";
import { checkCreatorAction, saveLeadAction, type LeadState } from "@/lib/creator/actions";
import { toCard } from "@/lib/creator/card";
import type { CreatorCheck } from "@/lib/creator/check";
import { CREATOR_PRICE } from "@/lib/creator/funnel";
import type { CreatorRead } from "@/lib/creator/read";
import type { ScoredPost } from "@/lib/creator/stats";
import { compact, percent } from "@/lib/format";

import ShareBar from "./share";
import { ResultCard, useReplay } from "./visuals";

/** What the check is doing, by the second it usually gets there. The read is one call, so this is a clock, not a signal. */
const STEPS = [
  { at: 0, label: (h: string) => `Reading @${h}'s last 12 posts` },
  { at: 15, label: () => "Measuring each one against your usual" },
  { at: 35, label: () => "Comparing what broke out with what stalled" },
  { at: 55, label: () => "Writing your next three hooks" },
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
      <p className="caption mt-3">Usually under a minute.</p>
    </div>
  );
}


/** What the breakouts share against the stalls, and (for the creator themself) the hooks to post next. */
export function ReadSection({ read, voice = "you", hooks = true }: { read: CreatorRead; voice?: "you" | "they"; hooks?: boolean }) {
  const your = voice === "you" ? "Your" : "Their";
  return (
    <div className="flex flex-col gap-3">
      {[
        { title: `${your} breakouts share`, items: read.breakouts_share, dot: "bg-pos" },
        { title: `${your} stalled posts share`, items: read.stalled_share, dot: "bg-neg" },
      ].map((col, i) => (
        <div key={col.title} className="card p-5 rise" style={{ animationDelay: `${300 + i * 120}ms` }}>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span className={`w-2 h-2 rounded-full ${col.dot}`} />
            {col.title}
          </div>
          {col.items.length ? (
            <ul className="list-disc pl-4 m-0 mt-2.5 flex flex-col gap-2 text-[14px] text-ink-2 leading-[1.55]">
              {col.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3 mt-2.5 mb-0">None in these posts.</p>
          )}
        </div>
      ))}
      {hooks && (
        <div className="card p-5 rise" style={{ animationDelay: "560ms" }}>
          <div className="text-[13px] font-semibold">Post next</div>
          <ol className="list-none p-0 m-0 mt-3 flex flex-col gap-4">
            {read.next_hooks.map((h, i) => (
              <li key={h.hook} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
                <span className="text-[13px] text-ink-3 tnum pt-[1px]">{i + 1}</span>
                <div>
                  <div className="text-[15px] font-medium leading-[1.45]">&ldquo;{h.hook}&rdquo;</div>
                  <div className="text-[13px] text-ink-2 leading-[1.5] mt-1">{h.why}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 pt-3 border-t border-line text-[13.5px] leading-[1.5]">
            <span className="font-medium">Stop: </span>
            <span className="text-ink-2">{read.stop}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const TIER_BADGE: Record<ScoredPost["tier"], React.ReactNode> = {
  breakout: <span className="badge badge-pos">Broke out</span>,
  typical: <span className="badge badge-outline">Usual</span>,
  stalled: <span className="badge badge-neg">Stalled</span>,
};

/** Every post, for anyone who wants the rows behind the chart. */
export function PostTable({ posts }: { posts: ScoredPost[] }) {
  return (
    <details className="card group">
      <summary className="flex items-center justify-between px-5 py-3.5 text-[14px] font-medium">
        All {posts.length} posts
        <span className="text-ink-3 text-[18px] leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="table w-full">
          <thead>
            <tr>
              <th className="text-left">Post</th>
              <th className="text-right hidden sm:table-cell">Engagement</th>
              <th className="text-right">vs. usual</th>
              <th className="text-left">Result</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => (
              <tr key={p.url ?? i}>
                <td className="max-w-[150px] sm:max-w-[380px]">
                  <div className="truncate">{p.caption ?? <span className="text-ink-3">No caption</span>}</div>
                  <div className="caption">{p.posted_at ? new Date(p.posted_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</div>
                </td>
                <td className="text-right tnum hidden sm:table-cell">{compact(p.interactions)}</td>
                <td className="text-right tnum">{p.multiple}×</td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    {TIER_BADGE[p.tier]}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink" aria-label="Open post">
                        <IconArrowUpRight />
                      </a>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
        <div className="lg:sticky lg:top-20 flex flex-col gap-4">
          <div className="rise">
            <ResultCard d={toCard(r)} run={run} />
          </div>
          {r.id ? (
            <ShareBar id={r.id} handle={r.handle ?? ""} onReplay={replay} />
          ) : (
            <button type="button" className="btn btn-ghost self-start" onClick={replay}>
              Replay
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-[18px] leading-[1.5] font-medium m-0 rise">{r.headline}</p>
          <div className="grid grid-cols-3 gap-3 rise" style={{ animationDelay: "150ms" }}>
            {[
              { label: "Usual post", value: compact(s.medianInteractions), note: "likes + comments + shares" },
              { label: "Stalled", value: percent(s.stalledRate, 0), note: `${s.stalled} of ${s.posts.length} at half or less` },
              { label: "Carried by", value: percent(s.topShare, 0), note: "of engagement from your top fifth" },
            ].map((k) => (
              <div key={k.label} className="well p-3.5">
                <div className="text-[12.5px] text-ink-2">{k.label}</div>
                <div className="text-[22px] font-semibold tracking-[-0.02em] tnum mt-0.5">{k.value}</div>
                <div className="caption leading-[1.35] mt-0.5">{k.note}</div>
              </div>
            ))}
          </div>
          {r.read ? <ReadSection read={r.read} /> : <p className="caption">The written read is unavailable right now; the numbers are complete.</p>}
          <PostTable posts={s.posts} />
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
          placeholder="Your niche, optional: e.g. home workouts, budget travel, skincare for men"
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
