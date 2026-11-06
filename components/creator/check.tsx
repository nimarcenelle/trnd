"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import SubmitButton from "@/components/app/submit-button";
import { IconArrowRight, IconArrowUpRight, IconCheck } from "@/components/icons";
import { checkCreatorAction, saveLeadAction, type LeadState } from "@/lib/creator/actions";
import type { CreatorCheck } from "@/lib/creator/check";
import { CREATOR_PRICE } from "@/lib/creator/funnel";
import type { ScoredPost } from "@/lib/creator/stats";
import { compact, percent } from "@/lib/format";

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

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="text-[26px] font-semibold tracking-[-0.02em] tnum mt-1">{value}</div>
      <div className="caption mt-0.5">{note}</div>
    </div>
  );
}

const TIER_BADGE: Record<ScoredPost["tier"], React.ReactNode> = {
  breakout: <span className="badge badge-pos">Broke out</span>,
  typical: <span className="badge badge-outline">Usual</span>,
  stalled: <span className="badge badge-neg">Stalled</span>,
};

function Result({ r }: { r: CreatorCheck }) {
  const s = r.stats!;
  const read = r.read;
  const signup = `/creators/start?handle=${encodeURIComponent(r.handle ?? "")}&platform=${r.platform}${r.src ? `&src=${encodeURIComponent(r.src)}` : ""}`;
  return (
    <div className="mt-12 text-left">
      {/* 1. The number: how big the gap is, from their own posts. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="heading text-[22px]">
          @{r.handle}
          {r.displayName && <span className="text-ink-3 font-normal text-[15px]"> · {r.displayName}</span>}
        </h2>
        {r.followers !== null && r.followers !== undefined && <span className="caption tnum">{compact(r.followers)} followers</span>}
      </div>
      <p className="text-[17px] leading-[1.55] mt-3 max-w-[720px]">{r.headline}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <Kpi label="Usual post" value={compact(s.medianInteractions)} note="median likes + comments + shares" />
        <Kpi label="Broke out" value={percent(s.breakoutRate, 0)} note={`${s.breakouts} of ${s.posts.length} at 2× your usual or more`} />
        <Kpi label="Stalled" value={percent(s.stalledRate, 0)} note={`${s.stalled} of ${s.posts.length} at half your usual or less`} />
        <Kpi label="Carried by" value={percent(s.topShare, 0)} note="of your engagement came from your top fifth of posts" />
      </div>

      <div className="card mt-4 overflow-x-auto">
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
            {s.posts.map((p, i) => (
              <tr key={p.url ?? i}>
                <td className="max-w-[160px] sm:max-w-[420px]">
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

      {/* 2. The free help: why, and what to post next. */}
      {read ? (
        <section className="mt-10">
          <p className="kicker">Why</p>
          <h3 className="heading text-[22px] mt-2 max-w-[720px]">{read.verdict}</h3>
          <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3 mt-5">
            {[
              { title: "Your breakouts share", items: read.breakouts_share, cls: "text-pos" },
              { title: "Your stalled posts share", items: read.stalled_share, cls: "text-neg" },
            ].map((col) => (
              <div key={col.title} className="card p-5">
                <div className={`text-[13px] font-semibold ${col.cls}`}>{col.title}</div>
                {col.items.length ? (
                  <ul className="list-disc pl-4 m-0 mt-2.5 flex flex-col gap-2 text-[14px] text-ink-2 leading-[1.55]">
                    {col.items.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-ink-3 mt-2.5">None in these posts.</p>
                )}
              </div>
            ))}
          </div>

          <p className="kicker mt-10">Post next</p>
          <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-3 gap-3 mt-3">
            {read.next_hooks.map((h) => (
              <div key={h.hook} className="card p-5">
                <blockquote className="m-0 border-l-2 border-ink pl-3 text-[15px] font-medium leading-[1.45]">&ldquo;{h.hook}&rdquo;</blockquote>
                <p className="text-[13px] text-ink-2 leading-[1.55] mt-3">{h.why}</p>
              </div>
            ))}
          </div>
          <div className="well px-4 py-3 mt-3 text-[14px] leading-[1.55]">
            <span className="font-medium">Stop: </span>
            <span className="text-ink-2">{read.stop}</span>
          </div>
        </section>
      ) : (
        <p className="caption mt-6">The written read is unavailable right now; the numbers above are complete.</p>
      )}

      <Recheck r={r} />

      {/* 3. The upgrade: the same read, every day, on the creators they compete with. */}
      <section className="card mt-12 p-6 sm:p-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8 items-center">
        <div>
          <p className="kicker">Creator plan</p>
          <h3 className="heading text-[22px] mt-2">This was 12 of your posts, once. TRND reads your niche every day.</h3>
          <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-3">
            Pick up to 10 creators you compete with. When one of their posts breaks out, you see it the next morning: the hook, the format, how far past
            their usual it went, and a hook of your own to answer it.
          </p>
          <ul className="list-none p-0 m-0 mt-5 flex flex-col gap-2.5">
            {["Up to 10 creators, read daily", "Their breakouts, as they happen", "Your posts measured the same way, every week", "Three hooks a week built on what's working now"].map(
              (x) => (
                <li key={x} className="flex gap-2.5 text-[14px]">
                  <IconCheck className="text-brand mt-[3px] shrink-0" />
                  {x}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="well p-6 text-center">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="display text-[40px] tnum">{CREATOR_PRICE}</span>
            <span className="text-ink-3 text-[14px]">per month</span>
          </div>
          <p className="caption mt-1">First month free. Cancel any time.</p>
          <a href={signup} className="btn btn-primary btn-lg w-full mt-5">
            Start free <IconArrowRight />
          </a>
        </div>
      </section>
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

export default function CreatorCheckForm({ src = "" }: { src?: string }) {
  const [state, action] = useActionState<CreatorCheck, FormData>(checkCreatorAction, {});
  return (
    <>
      <form action={action} className="w-full max-w-[560px] mx-auto">
        <div className="sitebox">
          <select name="platform" defaultValue={state.platform ?? "tiktok"} aria-label="Platform" className="bg-transparent text-[14px] text-ink-2 outline-none border-0 pr-1">
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
          <span className="w-px h-5 bg-line-strong" aria-hidden />
          <input type="hidden" name="src" value={state.src ?? src} />
          <input name="handle" defaultValue={state.handle ? `@${state.handle}` : ""} placeholder="@yourhandle" aria-label="Your handle" autoComplete="off" required />
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
      {state.stats && <Result r={state} />}
    </>
  );
}
