import Link from "next/link";
import { notFound } from "next/navigation";

import Avatar from "@/components/app/avatar";
import DiagnosisCard from "@/components/app/diagnosis-card";
import Locked from "@/components/app/locked";
import SubmitButton from "@/components/app/submit-button";
import FunnelShell, { StepNo } from "@/components/preview/funnel-shell";
import Cover from "@/components/preview/cover";
import KeyChoices from "@/components/preview/key-choices";
import PreviewRunner from "@/components/preview/runner";
import StartForm from "@/components/preview/start-form";
import Xray, { XrayWaiting } from "@/components/preview/xray";
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

/** One line icon per goal, drawn at 22px in the goal's tile. */
const GOAL_ICONS: Record<string, React.ReactNode> = {
  followers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 19c.8-3.4 3.3-5.5 6.5-5.5s5.7 2.1 6.5 5.5M18 7v6M15 10h6" />
    </>
  ),
  comments: <path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" />,
  views: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  deals: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8.5 7.5V5.5h7v2M3 12.5h18" />
    </>
  ),
  sales: (
    <>
      <path d="M5 8h14l-1.2 11.5H6.2z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
};

/**
 * The free read, one question a screen: the handle (the first screen, /),
 * "Is this you?", what they post for while the read runs, then what's wrong
 * with their videos. The diagnosis shows that something is wrong and how much;
 * what it is stays locked until they sign up and pay.
 */
function Who({ p }: { p: Preview }) {
  const a = p.author;
  const covers = p.videos.map((v) => v.storedCover || v.coverUrl).filter((u): u is string => Boolean(u)).slice(0, 4);
  const stats = [
    ["Followers", a?.followers],
    ["Likes", a?.hearts],
    ["Videos", a?.videos],
  ] as const;
  return (
    <div className="card p-5 sm:p-6 grid gap-5 max-w-[560px]">
      <div className="flex items-center gap-4 min-w-0">
        <Avatar name={p.handle} size={64} />
        <div className="min-w-0">
          <div className="text-[20px] font-bold leading-tight truncate">{a?.displayName || `@${p.handle}`}</div>
          <div className="text-ink-2 text-[15px]">@{p.handle}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([label, n]) => (
          <div key={label} className="well px-3 py-2.5">
            <div className="text-[18px] font-semibold tnum">{n !== null && n !== undefined ? compact(n) : "—"}</div>
            <div className="caption">{label}</div>
          </div>
        ))}
      </div>
      {covers.length > 0 && (
        <div className="grid grid-cols-4 gap-2" aria-label="Your latest videos">
          {covers.map((u) => (
            <Cover key={u} src={u} />
          ))}
        </div>
      )}
    </div>
  );
}

/** What the read is doing, ticked off as it goes. */
function Narration({ p, small = false }: { p: Preview; small?: boolean }) {
  const order = ["reading", "confirm", "niche", "idea", "ready"];
  const at = order.indexOf(p.status);
  const n = normalOf(p.videos.map((v) => asVideo(v, p.handle)));
  const rows = [
    { label: `Reading @${p.handle}'s videos`, done: at >= 1, now: p.status === "reading", found: p.videos.length ? `${p.videos.length} videos · usually ${compact(n.views)} views` : "" },
    { label: "Finding the creators a step ahead of you", done: at >= 3, now: p.status === "niche", found: p.peers.length ? `${p.peers.length} creators` : "" },
    { label: "Working out what's holding your videos back", done: at >= 4, now: p.status === "idea", found: "" },
  ];
  return (
    <ul className={`list-none m-0 p-0 grid ${small ? "gap-2.5 text-[14.5px] leading-snug" : "gap-3.5 text-[16px]"}`}>
      {rows.map((r) => (
        <li key={r.label} className={`flex gap-3 items-start ${r.done || r.now ? "text-ink" : "text-ink-3"}`}>
          <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] shrink-0 border-[1.5px] ${r.done ? "bg-ink border-ink text-surface" : r.now ? "border-brand border-t-transparent animate-spin" : "border-line-strong"}`}>{r.done ? "✓" : ""}</span>
          <span className="flex-1 grid">
            {r.label}
            {r.done && r.found && <span className={`${small ? "text-[12.5px]" : "text-[13px]"} text-ink-2`}>{r.found}</span>}
          </span>
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
      <FunnelShell step={2}>
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
      </FunnelShell>
    );
  }

  if (p.status === "error") {
    return (
      <FunnelShell step={2}>
        <h1 className="display text-[clamp(28px,4.8vw,42px)]">That didn&apos;t work</h1>
        <p className="text-ink-2 text-[17px] mt-3 mb-8">{p.reason}</p>
        <StartForm cta="Try again" defaultHandle={p.handle} compact />
      </FunnelShell>
    );
  }

  if (p.status === "reading" || p.status === "confirm") {
    return (
      <FunnelShell step={2}>
        {working && <PreviewRunner id={p.id} />}
        <div className={p.status === "confirm" ? "max-w-[680px]" : "grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] items-start"}>
          <div>
          <StepNo n={2} />
          <h1 className="display text-[clamp(32px,5.2vw,52px)]">{p.status === "confirm" ? "Is this you?" : `Finding @${p.handle}…`}</h1>
          {p.status === "confirm" ? (
            <div className="mt-8 grid gap-6">
              <Who p={p} />
              <form action={confirmPreviewAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton className="btn btn-primary btn-lg" pending="Starting…">
                  Yes, that&apos;s me
                </SubmitButton>
                <Link href="/" className="btn btn-lg btn-ghost">
                  No, try another handle
                </Link>
              </form>
            </div>
          ) : (
            <div className="mt-8 max-w-[560px]">
              <Narration p={p} />
            </div>
          )}
          </div>
          {p.status === "reading" && (
            <aside className="max-lg:hidden">
              <XrayWaiting handle={p.handle} />
            </aside>
          )}
        </div>
      </FunnelShell>
    );
  }

  if (p.status !== "ready" || !p.plan) {
    // The read runs; meanwhile, the one question that shapes it.
    return (
      <FunnelShell step={3}>
        {working && <PreviewRunner id={p.id} />}
        <KeyChoices />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] items-start">
        <div>
        <StepNo n={3} />
        <h1 className="display text-[clamp(32px,5.2vw,52px)]">What are you posting for?</h1>
        <p className="text-ink-2 text-[17px] mt-3 mb-7">We weigh what&apos;s wrong by it. We&apos;re reading your videos while you answer.</p>
        <div className="grid gap-2.5 sm:grid-cols-2 max-w-[600px]">
          {GOALS.map((g, i) => {
            const on = p.goal === g.value;
            return (
              <form key={g.value} action={previewGoalAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="goal" value={g.value} />
                <button
                  type="submit"
                  data-key={LETTERS[i]}
                  aria-pressed={on}
                  className={`group relative grid gap-3 max-sm:flex max-sm:items-center max-sm:gap-3.5 w-full h-full text-left rounded-[16px] border px-4 pt-4 pb-3.5 transition-[border-color,box-shadow,transform,background-color] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${on ? "border-brand bg-brand-soft shadow-[0_0_0_1px_var(--brand)]" : "border-line bg-surface hover:border-line-strong"}`}
                >
                  <span className={`w-10 h-10 rounded-full grid place-items-center transition-colors ${on ? "bg-brand text-on-brand" : "bg-muted text-ink group-hover:bg-brand-soft group-hover:text-brand"}`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {GOAL_ICONS[g.value]}
                    </svg>
                  </span>
                  <span className="grid">
                    <span className="text-[16.5px] font-semibold">{g.label}</span>
                    <span className="text-[13.5px] text-ink-2">{g.hint}</span>
                  </span>
                  <span className={`absolute top-3.5 right-3.5 text-[11.5px] font-semibold ${on ? "text-brand" : "text-ink-3 max-sm:hidden"}`}>{on ? "✓" : LETTERS[i]}</span>
                </button>
              </form>
            );
          })}
        </div>
        <p className="caption mt-4 max-sm:hidden">
          Press <b>A</b>–<b>{LETTERS[GOALS.length - 1]}</b> to choose.
        </p>
        </div>
        <aside className="grid gap-5 lg:mt-14">
          {/* Two rows: enough to show it is their grid, and it ends with the goal tiles beside it. */}
          {p.videos.length > 0 ? <Xray videos={p.videos} limit={6} /> : <XrayWaiting handle={p.handle} />}
          <div className="px-1">
            <Narration p={p} small />
          </div>
        </aside>
        </div>
      </FunnelShell>
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
    <FunnelShell step={4} wide>
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
        <div className="lg:sticky lg:top-6">{d && <DiagnosisCard handle={p.handle} followers={p.author?.followers ?? null} d={d} gap={gap} locked />}</div>

        <div className="grid gap-4">
          <div className="rise">
            <p className="text-[13.5px] font-semibold text-neg m-0">@{p.handle}, here&apos;s the problem</p>
            <h1 className="display text-[clamp(28px,4.2vw,38px)] mt-2">
              {d ? (d.stuck === d.n ? `None of your last ${d.n} videos broke out.` : `${d.stuck} of your last ${d.n} videos didn't break out.`) : "Your videos aren't breaking out."}
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

          <Xray videos={p.videos} limit={12} wide />

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
            <div className="font-bold">{d ? `${d.stuck} of ${d.n} videos didn't break out` : "Your videos aren't breaking out"}</div>
            <div className="caption">Find out what&apos;s killing them. Free account, no card.</div>
          </div>
          <Link href={signup} className="btn btn-primary btn-lg max-sm:w-full">
            See what&apos;s killing my posts
          </Link>
        </div>
      </div>
    </FunnelShell>
  );
}
