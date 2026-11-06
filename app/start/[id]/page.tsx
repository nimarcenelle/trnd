import Link from "next/link";
import { notFound } from "next/navigation";

import Avatar from "@/components/app/avatar";
import DiagnosisCard from "@/components/app/diagnosis-card";
import Locked from "@/components/app/locked";
import SubmitButton from "@/components/app/submit-button";
import Brand from "@/components/brand";
import PreviewRunner from "@/components/preview/runner";
import StartForm from "@/components/preview/start-form";
import { yearlyPerMonth } from "@/lib/billing";
import { diagnose } from "@/lib/creators/diagnosis";
import { dollarRange, gapOf, postsPerMonth, RPM_ASSUMPTION, typicalByAuthor } from "@/lib/creators/gap";
import { normalOf } from "@/lib/creators/stats";
import { compact, times } from "@/lib/format";
import { GOALS } from "@/lib/goals";
import { confirmPreviewAction, previewGoalAction } from "@/lib/preview/actions";
import { asVideo, getPreview } from "@/lib/preview/run";
import type { Preview } from "@/lib/preview/types";

export const metadata = { title: "What's holding your videos back — TRND for creators", robots: { index: false } };

const LETTERS = "ABCDEFGH";

/**
 * The free read, one question a screen: the handle (the first screen, /),
 * "Is this you?", what they post for while the read runs, then what's wrong
 * with their videos. The diagnosis shows that something is wrong and how much;
 * what it is stays locked until they sign up and pay.
 */
function Shell({ step, wide = false, children }: { step: number; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="h-1 bg-muted">
        <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${(step / 4) * 100}%` }} />
      </div>
      <header className="wrap flex items-center justify-between h-14">
        <Brand />
        <Link href="/login" className="btn btn-ghost btn-sm">
          Sign in
        </Link>
      </header>
      <main className={`flex-1 ${wide ? "wrap pt-6 sm:pt-10 pb-[calc(8rem+env(safe-area-inset-bottom))]" : "grid items-center"}`}>
        {wide ? children : <div className="rise wrap max-w-[680px] py-10">{children}</div>}
      </main>
    </div>
  );
}

function StepNo({ n }: { n: number }) {
  return <div className="text-[13px] text-brand font-medium tnum mb-3">{n} → 4</div>;
}

function Who({ p }: { p: Preview }) {
  const a = p.author;
  return (
    <div className="flex items-center gap-3.5 min-w-0">
      <Avatar name={p.handle} size={56} />
      <div className="min-w-0">
        <div className="text-[19px] font-bold leading-tight">{a?.displayName || `@${p.handle}`}</div>
        <div className="text-ink-2 text-[14.5px]">
          @{p.handle}
          {a?.followers !== null && a?.followers !== undefined ? ` · ${compact(a.followers)} followers` : ""}
          {a?.videos ? ` · ${compact(a.videos)} videos` : ""}
        </div>
      </div>
    </div>
  );
}

/** What the read is doing, ticked off as it goes. */
function Narration({ p }: { p: Preview }) {
  const order = ["reading", "confirm", "niche", "idea", "ready"];
  const at = order.indexOf(p.status);
  const n = normalOf(p.videos.map((v) => asVideo(v, p.handle)));
  const rows = [
    { label: `Reading @${p.handle}'s videos`, done: at >= 1, now: p.status === "reading", found: p.videos.length ? `${p.videos.length} videos · usually ${compact(n.views)} views` : "" },
    { label: "Finding the creators a step ahead of you", done: at >= 3, now: p.status === "niche", found: p.peers.length ? `${p.peers.length} creators` : "" },
    { label: "Working out what's holding your videos back", done: at >= 4, now: p.status === "idea", found: "" },
  ];
  return (
    <ul className="list-none m-0 p-0 grid gap-3.5 text-[16px]">
      {rows.map((r) => (
        <li key={r.label} className={`flex gap-3 items-center ${r.done || r.now ? "text-ink" : "text-ink-3"}`}>
          <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] shrink-0 border-[1.5px] ${r.done ? "bg-ink border-ink text-surface" : r.now ? "border-brand border-t-transparent animate-spin" : "border-line-strong"}`}>{r.done ? "✓" : ""}</span>
          <span className="flex-1">{r.label}</span>
          {r.done && r.found && <span className="text-[13px] text-ink-2 text-right">{r.found}</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function StartPage({ params }: PageProps<"/start/[id]">) {
  const { id } = await params;
  const p = await getPreview(id);
  if (!p) notFound();
  const working = p.status === "reading" || p.status === "niche" || p.status === "idea";
  const signup = `/signup?handle=${encodeURIComponent(p.handle)}`;

  if (p.status === "ineligible") {
    const missing = p.reason === "not_found";
    return (
      <Shell step={2}>
        <h1 className="display text-[clamp(28px,4.8vw,42px)]">{missing ? `We couldn't find @${p.handle}` : `@${p.handle} needs a few more videos`}</h1>
        <p className="text-ink-2 text-[17px] mt-3 mb-8">
          {missing
            ? "Check the spelling, and that the account is public. We can only read public profiles."
            : `We found ${p.videos.length} public ${p.videos.length === 1 ? "video" : "videos"}. Post a few more and there's something to learn from. Create a free account and we'll read it as soon as there's enough.`}
        </p>
        {missing ? (
          <StartForm cta="Try again" />
        ) : (
          <Link href={signup} className="btn btn-primary btn-lg">
            Create a free account
          </Link>
        )}
      </Shell>
    );
  }

  if (p.status === "error") {
    return (
      <Shell step={2}>
        <h1 className="display text-[clamp(28px,4.8vw,42px)]">That didn&apos;t work</h1>
        <p className="text-ink-2 text-[17px] mt-3 mb-8">{p.reason}</p>
        <StartForm cta="Try again" defaultHandle={p.handle} compact />
      </Shell>
    );
  }

  if (p.status === "reading" || p.status === "confirm") {
    return (
      <Shell step={2}>
        {working && <PreviewRunner id={p.id} />}
        <StepNo n={2} />
        <h1 className="display text-[clamp(30px,5vw,46px)]">{p.status === "confirm" ? "Is this you?" : `Finding @${p.handle}…`}</h1>
        {p.status === "confirm" ? (
          <div className="mt-8 grid gap-8">
            <Who p={p} />
            <form action={confirmPreviewAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton className="btn btn-primary btn-lg" pending="Starting…">
                Yes, that&apos;s me
              </SubmitButton>
              <Link href="/" className="btn btn-ghost">
                Not me
              </Link>
            </form>
          </div>
        ) : (
          <div className="mt-8">
            <Narration p={p} />
          </div>
        )}
      </Shell>
    );
  }

  if (p.status !== "ready" || !p.plan) {
    // The read runs; meanwhile, the one question that shapes it.
    return (
      <Shell step={3}>
        {working && <PreviewRunner id={p.id} />}
        <StepNo n={3} />
        <h1 className="display text-[clamp(30px,5vw,46px)]">What are you posting for?</h1>
        <p className="text-ink-2 text-[16.5px] mt-3 mb-7">We&apos;re reading your videos while you answer.</p>
        <div className="grid gap-2.5 max-w-[440px]">
          {GOALS.map((g, i) => (
            <form key={g.value} action={previewGoalAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="goal" value={g.value} />
              <button
                type="submit"
                aria-pressed={p.goal === g.value}
                className={`flex items-center gap-3 w-full text-left rounded-[12px] border px-4 py-3.5 text-[16.5px] font-medium transition-colors ${p.goal === g.value ? "border-ink bg-subtle shadow-[0_0_0_1px_var(--ink)]" : "border-line-strong hover:bg-subtle"}`}
              >
                <span className={`w-7 h-7 rounded-[7px] grid place-items-center text-[12px] font-semibold border ${p.goal === g.value ? "bg-ink text-surface border-ink" : "border-line-strong text-ink-2"}`}>{LETTERS[i]}</span>
                {g.label}
              </button>
            </form>
          ))}
        </div>
        <div className="mt-10 border-t border-line pt-6">
          <Narration p={p} />
        </div>
      </Shell>
    );
  }

  // Ready: what's wrong, how much, and that only the full read says what it is.
  const own = p.videos.map((v) => asVideo(v, p.handle));
  const normal = normalOf(own);
  const d = diagnose(own, normal);
  const sample = p.sample.map((v) => asVideo(v, p.handle));
  const typical = typicalByAuthor(sample);
  const gap = gapOf(
    { followers: p.author?.followers ?? null, typical: normal.views },
    p.peers.map((x) => ({ followers: x.followers, typical: typical.get(x.handle) ?? null })),
    postsPerMonth(p.videos.map((v) => v.postedAt)),
  );
  const problems = Math.max(2, p.plan.problems?.length ?? 2);

  return (
    <Shell step={4} wide>
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
        <div className="lg:sticky lg:top-6">{d && <DiagnosisCard handle={p.handle} followers={p.author?.followers ?? null} d={d} gap={gap} locked />}</div>

        <div className="grid gap-4">
          <div className="rise">
            <p className="text-[13.5px] font-semibold text-neg m-0">@{p.handle}, here&apos;s the problem</p>
            <h1 className="display text-[clamp(28px,4.2vw,38px)] mt-2">
              {d ? (d.stuck === d.n ? `None of your last ${d.n} videos got past your followers.` : `${d.stuck} of your last ${d.n} videos never got past your followers.`) : "Your videos are getting stuck with your followers."}
            </h1>
            {gap && gap.ahead > gap.mine && (
              <p className="text-[17px] text-ink-2 leading-[1.5] mt-3 mb-0">
                The creators {gap.band === "2-5x" ? "2–5× your size" : "ahead of you"} in your niche get <b className="text-ink tnum">{compact(gap.ahead)}</b> views on a typical video. You get{" "}
                <b className="text-ink tnum">{compact(gap.mine)}</b>.
                {gap.dollars && (
                  <>
                    {" "}
                    At Creator Rewards rates that&apos;s roughly <b className="text-ink tnum" title={RPM_ASSUMPTION}>{dollarRange(gap.dollars)}</b> you&apos;re leaving on the table.
                  </>
                )}
              </p>
            )}
            {d?.worst && (
              <p className="text-[15.5px] leading-[1.5] mt-3 mb-0">
                Your worst recent video, &ldquo;{d.worst.title}&rdquo;, got <b className="tnum">{times(d.worst.times)}</b> your usual views.
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href={signup} className="btn btn-primary btn-lg">
                See what&apos;s killing my posts
              </Link>
              <span className="caption">Free account, no card.</span>
            </div>
          </div>

          <Locked title="What's killing your posts" detail="1 line" lines={1} />
          <Locked title="Why your videos flop" detail={`${problems} problems`} />
          {p.peers.length > 0 && <Locked title="What the creators ahead of you do that you don't" detail={`${p.peers.length} creators`} />}
          <Locked title="Your next 3 videos, scripted" detail="written for you" lines={3} />

          <div className="night p-6 sm:p-8 mt-2">
            <div className="text-[13px] text-night-ink-2">Only TRND can tell you this</div>
            <div className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em] leading-[1.15] mt-1">See exactly what&apos;s wrong with your videos, and fix it.</div>
            <p className="text-night-ink-2 text-[15px] mt-3 mb-0">
              We read every video you post against the creators a step ahead of you. Free shows you your first fix. Creator shows you everything that&apos;s
              wrong, with three scripts a week to fix it, from {yearlyPerMonth("creator")}/month.
            </p>
            <Link href={signup} className="btn btn-lg mt-6 !bg-on-night !text-night !border-on-night">
              See what&apos;s wrong
            </Link>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="wrap flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 max-sm:hidden">
            <div className="font-bold">{d ? `${d.stuck} of ${d.n} videos stuck with your followers` : "Your videos are stuck with your followers"}</div>
            <div className="caption">Find out what&apos;s killing them. Free account, no card.</div>
          </div>
          <Link href={signup} className="btn btn-primary btn-lg max-sm:w-full">
            See what&apos;s killing my posts
          </Link>
        </div>
      </div>
    </Shell>
  );
}
