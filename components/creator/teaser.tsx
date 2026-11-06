import { IconCheck, IconLock } from "@/components/icons";
import { unlockAction } from "@/lib/creator/actions";
import { gapLine } from "@/lib/creator/benchmark";
import type { CreatorCheck } from "@/lib/creator/check";
import { CREATOR_PRICE } from "@/lib/creator/funnel";
import { diagnosis } from "@/lib/creator/stats";

import DiagnosisCard from "./diagnosis-card";

/**
 * The report before it is paid for: the diagnosis that stings (how many posts
 * never left their followers, how far behind the top of the niche, their
 * worst post), and everything that explains it locked. None of the locked
 * text is sent to the browser: the blurred lines are filler.
 */

const FILLER = [
  "Your openings name the topic instead of giving a stranger a reason to stay past the first line.",
  "The posts that flopped all start the same way, and the top of your niche never does.",
  "Every hit you had did one thing in the first two seconds that the rest skipped.",
];

function Locked({ title, detail, lines = 2 }: { title: string; detail: string; lines?: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
          <IconLock /> {detail}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 blur-[6px] select-none" aria-hidden>
        {FILLER.slice(0, lines).map((t) => (
          <p key={t} className="m-0 text-[14.5px] text-ink-2 leading-[1.5]">
            {t}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function Teaser({ c, billingOff, unpaid }: { c: CreatorCheck & { id: string; token: string }; billingOff?: boolean; unpaid?: boolean }) {
  const s = c.stats!;
  const b = c.benchmark;
  const worst = [...s.posts].sort((a, x) => a.multiple - x.multiple)[0];
  const flopPoints = Math.max(2, c.read?.stalled_share.length ?? 2);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
      <div className="lg:sticky lg:top-20">
        <DiagnosisCard handle={c.handle ?? ""} platform={c.platform ?? "tiktok"} followers={c.followers} stats={s} benchmark={b} locked />
      </div>

      <div className="flex flex-col gap-4">
        <div className="rise">
          <p className="text-[13px] font-medium text-neg m-0">@{c.handle}, here&apos;s the problem</p>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.03em] leading-[1.15] mt-2 mb-0">{diagnosis(s)}</h1>
          {b && <p className="text-[17px] text-ink-2 leading-[1.5] mt-3 mb-0">{gapLine(b)}</p>}
          {worst && (
            <p className="text-[15px] leading-[1.5] mt-3 mb-0">
              Your worst post, &ldquo;{(worst.caption ?? "No caption").slice(0, 80)}&rdquo;, got <b className="tnum">{worst.multiple}×</b> your usual.
            </p>
          )}
          <form action={unlockAction} className="mt-5 flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="k" value={c.token} />
            <button type="submit" className="btn btn-primary btn-lg">
              <IconLock /> See what&apos;s killing them
            </button>
            <span className="caption">
              {CREATOR_PRICE}/month · cancel any time
            </span>
          </form>
        </div>

        <Locked title="What's killing your posts" detail="1 line" lines={1} />
        <Locked title="Why your posts flop" detail={`${flopPoints} reasons`} />
        {b && <Locked title={`What the top of #${b.tag} does that you don't`} detail={`${b.posts.length} creators`} />}
        <Locked title="3 hooks to post next" detail="written for you" lines={3} />
        <Locked title="Stop doing this" detail="1 habit" lines={1} />

        <div className="stage p-6 sm:p-8 mt-2">
          <div className="text-[13px] text-stage-ink-2">Your full report</div>
          <div className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em] leading-[1.15] mt-1">See exactly what&apos;s killing your posts, and fix it.</div>
          <ul className="list-none p-0 m-0 mt-5 flex flex-col gap-2.5 text-[15px]">
            {[
              "What's killing your posts, from your own captions",
              b ? `What the top of #${b.tag} does that you don't, and who's winning` : "What your hits did that your flops didn't",
              "3 hooks written for your next posts",
              "Your posts re-checked every week",
            ].map((x) => (
              <li key={x} className="flex gap-2.5">
                <IconCheck className="text-stage-pos mt-[3px] shrink-0" />
                {x}
              </li>
            ))}
          </ul>
          <form action={unlockAction} className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="k" value={c.token} />
            <button type="submit" className="btn btn-lg bg-stage-ink text-stage hover:opacity-90 px-6">
              Unlock my report
            </button>
            <span className="text-[14px] text-stage-ink-2">
              <span className="text-stage-ink font-semibold tnum">{CREATOR_PRICE}</span>/month · cancel any time
            </span>
          </form>
          {billingOff && <p className="text-[13px] text-stage-neg mt-4 mb-0">Payments aren&apos;t switched on on this server yet (STRIPE_CREATOR_PRICE).</p>}
          {unpaid && <p className="text-[13px] text-stage-neg mt-4 mb-0">The payment didn&apos;t go through, so nothing was charged. Try again.</p>}
        </div>
      </div>
    </div>
  );
}
