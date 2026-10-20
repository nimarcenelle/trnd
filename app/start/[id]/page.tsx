import Link from "next/link";
import { notFound } from "next/navigation";

import Avatar from "@/components/app/avatar";
import IdeaCard from "@/components/app/idea-card";
import LockedIdea from "@/components/app/locked-idea";
import { StageBar, STAGE_LABEL } from "@/components/app/stage";
import SubmitButton from "@/components/app/submit-button";
import { Emphasis } from "@/components/app/views";
import Brand from "@/components/brand";
import PreviewRunner from "@/components/preview/runner";
import StartForm from "@/components/preview/start-form";
import { aheadLine, normalOf, timesNormal } from "@/lib/creators/stats";
import { compact } from "@/lib/format";
import { GOALS } from "@/lib/goals";
import { confirmPreviewAction, previewGoalAction } from "@/lib/preview/actions";
import { asVideo, getPreview } from "@/lib/preview/run";
import type { Preview } from "@/lib/preview/types";

export const metadata = { title: "Your free plan — TRND for creators", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line bg-bg/90 backdrop-blur sticky top-0 z-30">
        <div className="wrap flex items-center justify-between h-14">
          <Brand />
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
        </div>
      </header>
      <main className="wrap flex-1 py-8 sm:py-12 pb-28">{children}</main>
    </div>
  );
}

function Who({ p }: { p: Preview }) {
  const a = p.author;
  return (
    <div className="flex items-center gap-3.5 min-w-0">
      <Avatar name={p.handle} size={52} />
      <div className="min-w-0">
        <div className="text-[18px] font-bold leading-tight">{a?.displayName || `@${p.handle}`}</div>
        <div className="text-ink-2 text-[14px]">
          @{p.handle}
          {a?.followers !== null && a?.followers !== undefined ? ` · ${compact(a.followers)} followers` : ""}
          {a?.videos ? ` · ${compact(a.videos)} videos` : ""}
        </div>
      </div>
    </div>
  );
}

/** The real steps, each ticked off as it finishes, with what it found. */
function Steps({ p }: { p: Preview }) {
  const order = ["reading", "confirm", "niche", "idea", "ready"];
  const at = order.indexOf(p.status);
  const own = p.videos.map((v) => asVideo(v, p.handle));
  const n = normalOf(own);
  const rows = [
    { label: "Reading your videos", done: at >= 1, now: p.status === "reading", found: p.videos.length ? `${p.videos.length} videos · usually ${compact(n.views)} views` : "" },
    { label: "Finding creators ahead of you and what's rising", done: at >= 3, now: p.status === "niche", found: p.peers.length ? `${p.peers.length} creators · ${p.trends.length} trends` : "" },
    { label: "Writing your next 3 videos", done: at >= 4, now: p.status === "idea", found: "" },
  ];
  return (
    <ul className="list-none m-0 p-0 card overflow-hidden">
      {rows.map((r) => (
        <li key={r.label} className={`flex gap-3 items-center px-4 py-3.5 border-b border-line last:border-b-0 ${r.done || r.now ? "text-ink" : "text-ink-3"}`}>
          <span className={`w-[18px] h-[18px] rounded-full grid place-items-center text-[11px] shrink-0 border-[1.5px] ${r.done ? "bg-pos border-pos text-surface" : r.now ? "border-brand border-t-transparent animate-spin" : "border-line"}`}>{r.done ? "✓" : ""}</span>
          <span className="flex-1">{r.label}</span>
          {r.done && r.found && <span className="text-[13px] text-ink-2 text-right">{r.found}</span>}
        </li>
      ))}
    </ul>
  );
}

function GoalChips({ p, action, submitLabel }: { p: Preview; action: (fd: FormData) => Promise<void>; submitLabel?: string }) {
  return (
    <div className="grid gap-2.5">
      <div className="text-[14px] font-semibold">What are you posting for?</div>
      <div className="flex flex-wrap gap-2">
        {GOALS.map((g) => (
          <form key={g.value} action={action}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="goal" value={g.value} />
            <button type="submit" className={`btn btn-sm ${p.goal === g.value ? "!border-brand !bg-brand-soft !text-brand" : ""}`} aria-pressed={p.goal === g.value}>
              {g.label}
            </button>
          </form>
        ))}
      </div>
      {submitLabel && <p className="caption">{submitLabel}</p>}
    </div>
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
      <Shell>
        <section className="max-w-[620px] grid gap-5">
          <h1 className="display text-[clamp(26px,4.5vw,38px)]">{missing ? `We couldn't find @${p.handle}` : `@${p.handle} needs a few more videos`}</h1>
          <p className="text-ink-2 text-[16px]">
            {missing
              ? "Check the spelling, and that the account is public. We can only read public profiles."
              : `We found ${p.videos.length} public ${p.videos.length === 1 ? "video" : "videos"}. Post a few more and your plan has something to learn from. Create a free account and we'll build it as soon as there's enough.`}
          </p>
          {missing ? (
            <StartForm cta="Try again" />
          ) : (
            <Link href={signup} className="btn btn-primary btn-lg self-start">
              Create a free account
            </Link>
          )}
        </section>
      </Shell>
    );
  }

  if (p.status === "error") {
    return (
      <Shell>
        <section className="max-w-[620px] grid gap-5">
          <h1 className="display text-[clamp(26px,4.5vw,38px)]">That didn&apos;t work</h1>
          <p className="text-ink-2 text-[16px]">{p.reason}</p>
          <StartForm cta="Try again" defaultHandle={p.handle} compact />
        </section>
      </Shell>
    );
  }

  if (p.status !== "ready" || !p.plan) {
    return (
      <Shell>
        {working && <PreviewRunner id={p.id} />}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] items-start max-w-[1000px]">
          <section className="grid gap-5">
            <span className="kicker">{p.status === "reading" || p.status === "confirm" ? "Step 1 of 2" : "Step 2 of 2"}</span>
            <h1 className="display text-[clamp(26px,4.5vw,40px)]">{p.status === "reading" ? `Finding @${p.handle}…` : p.status === "confirm" ? "Is this you?" : "Building your plan"}</h1>
            {p.status === "confirm" ? (
              <div className="card p-5 grid gap-5">
                <Who p={p} />
                <form action={confirmPreviewAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="btn btn-primary btn-lg" pending="Starting…">
                    Yes, that&apos;s me
                  </SubmitButton>
                  <Link href="/#start" className="btn btn-ghost">
                    Not me
                  </Link>
                </form>
              </div>
            ) : (
              <p className="text-ink-2 text-[16px]">About a minute. We read your videos, find creators a step ahead of you and what&apos;s rising in your niche, then write three videos for you.</p>
            )}
            {p.status !== "confirm" && <Steps p={p} />}
          </section>
          {(p.status === "niche" || p.status === "idea") && (
            <aside className="card p-5 grid gap-4">
              <GoalChips p={p} action={previewGoalAction} submitLabel="Optional. Your three videos are written for it." />
              {p.peers.length > 0 && (
                <div className="grid gap-2.5">
                  <div className="text-[14px] font-semibold">Creators ahead of you</div>
                  <div className="flex flex-wrap gap-2">
                    {p.peers.map((x) => (
                      <span key={x.handle} className="chip gap-1.5">
                        <Avatar name={x.handle} size={18} />@{x.handle}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </Shell>
    );
  }

  // Ready: the preview. Idea 1 in full; 2 and 3 by their hooks only.
  const own = p.videos.map((v) => asVideo(v, p.handle));
  const normal = normalOf(own);
  const best = own.map((v) => ({ v, x: timesNormal(v.views, normal) })).sort((a, b) => (b.x ?? 0) - (a.x ?? 0))[0];
  const [first, ...rest] = p.plan.ideas;
  const sample = p.sample.map((v) => asVideo(v, p.handle));
  const src = first.source_video ? [...own, ...sample].find((v) => v.video_id === first.source_video) ?? null : null;
  const srcNormal = src ? normalOf(src.is_self ? own : sample.filter((v) => v.author === src.author)) : null;

  return (
    <Shell>
      <div className="grid gap-5 max-w-[1000px]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Who p={p} />
          <span className="pill pill-pos">Free preview</span>
        </div>
        <div className="night grid gap-2.5 p-[22px]">
          <span className="label">Your answer this week</span>
          <h1 className="heading text-[clamp(19px,2.8vw,25px)]">
            <Emphasis text={p.plan.headline} />
          </h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border border-line rounded-[14px] overflow-hidden max-sm:[&>*:last-child]:col-span-2">
          <div className="bg-surface px-4 py-3">
            <div className="label">Your typical video</div>
            <div className="display !font-semibold text-[20px] mt-1">{compact(normal.views)}</div>
            <div className="caption">views, from your last {own.length}</div>
          </div>
          <div className="bg-surface px-4 py-3">
            <div className="label">Your best recent</div>
            <div className="display !font-semibold text-[20px] mt-1">{best?.x ? `${best.x}×` : "—"}</div>
            <div className="caption">your usual views</div>
          </div>
          <div className="bg-surface px-4 py-3">
            <div className="label">Your niche</div>
            <div className="font-bold text-[15px] mt-1.5">{p.profile?.niche.slice(0, 2).join(" · ") || "—"}</div>
            <div className="caption">{p.peers.length} creators ahead of you</div>
          </div>
        </div>

        <IdeaCard
          idea={first}
          rank={1}
          planId="preview"
          source={{ video: src, own: Boolean(src?.is_self), times: src && srcNormal ? timesNormal(src.views, srcNormal) : null, borrow: null, trend: first.source_trend ? (p.trends.find((t) => t.key === first.source_trend) ?? null) : null }}
          normal={normal}
          run={null}
          open
          sample
        />
        {rest.map((i, n) => (
          <LockedIdea key={n} hook={i.hook} type={i.type} rank={n + 2} />
        ))}

        <div className="grid gap-3.5 md:grid-cols-2">
          {p.peers.length > 0 && (
            <div className="card p-4 grid gap-3 content-start">
              <div className="font-bold">Creators ahead of you</div>
              {p.peers.slice(0, 4).map((x) => (
                <div key={x.handle} className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={x.handle} size={30} />
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px]">@{x.handle}</div>
                    <div className="caption line-clamp-1">{[aheadLine(x.followers, p.author?.followers ?? null), x.best?.hook ? `“${x.best.hook}” · ${compact(x.best.views)} views` : `${compact(x.followers)} followers`].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {p.trends.length > 0 && (
            <div className="card p-4 grid gap-3 content-start">
              <div className="font-bold">Rising in your niche</div>
              {p.trends.slice(0, 4).map((t) => (
                <div key={`${t.kind}:${t.key}`} className="flex items-center justify-between gap-3">
                  <span className={`min-w-0 ${t.kind === "hashtag" ? "mono text-[13.5px]" : "text-[14px]"}`}>{t.label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <StageBar stage={t.stage} />
                    <span className="caption w-14">{STAGE_LABEL[t.stage]}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The one thing to do next, always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="wrap flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 max-sm:hidden">
            <div className="font-bold">Get all 3 scripts, and a new plan every week</div>
            <div className="caption">Free for 14 days. Cancel anytime.</div>
          </div>
          <Link href={signup} className="btn btn-primary btn-lg max-sm:w-full">
            Unlock my plan, free
          </Link>
        </div>
      </div>
    </Shell>
  );
}
