import Link from "next/link";

import Brand from "@/components/brand";
import { redirect } from "next/navigation";

import { NicheSection } from "@/components/creator/check";
import DiagnosisCard from "@/components/creator/diagnosis-card";
import { SAMPLE_CREATORS } from "@/components/sample/creator";
import SiteNav from "@/components/site-nav";
import { cleanSrc } from "@/lib/creator/check";

export const metadata = {
  title: "Make every post go viral — TRND for creators",
  description: "Find out exactly why your posts flop. A free check of your last 12 TikTok or Instagram posts: what's killing them, and what to post instead.",
};
// The profile read and the written read together can take a minute or more.
export const maxDuration = 300;

/** How a post that breaks out gets made again, in the order the check does it. */
const STEPS = [
  { title: "See which posts flopped", body: "Each of your last 12 posts is measured against your own usual. You'll see exactly which ones never got past your followers." },
  { title: "Find out what's killing them", body: "The opening, the promise, the format. Quoted from your own captions, side by side with your hits and the top posts in your niche." },
  { title: "Post the fix", body: "Three hooks built on what already worked for you. Copy one, film it, post it. Check again next week." },
];

/** What most creators are never told, plainly. The authority before the ask. */
const TRUTHS = [
  {
    title: "Your followers are not your audience",
    body: "TikTok and Instagram tend to show a new post to a small group first, often people who already follow you, and only show it further when that group stays and reacts. A post that does 'fine' with your followers usually stops there.",
  },
  {
    title: "A few posts carry every account",
    body: "On most accounts a small share of posts brings in most of the engagement. The check shows your own split. Growth comes from making more of those, not from posting more of everything.",
  },
  {
    title: "The opening line decides it",
    body: "The breakouts and the stalls on the same account are often the same topic, said differently in the first two seconds. That is the cheapest thing you can change.",
  },
];

/** ?src= says which video or link sent the visitor; it rides along to every event they cause. */
export default async function CreatorsPage({ searchParams }: PageProps<"/creators">) {
  const q = await searchParams;
  const src = cleanSrc(q.src);
  // An old link with ?handle= goes straight into the onboarding with it.
  if (typeof q.handle === "string" && q.handle.trim()) {
    redirect(`/check?${new URLSearchParams({ handle: q.handle.slice(0, 60), platform: q.platform === "instagram" ? "instagram" : "tiktok", ...(src ? { src } : {}) })}`);
  }
  // The "not luck" pair: the invented cook's best and worst post.
  const sample = SAMPLE_CREATORS[0];
  const byMultiple = [...sample.stats.posts].sort((a, b) => b.multiple - a.multiple);
  const hit = byMultiple[0];
  const miss = byMultiple[byMultiple.length - 1];
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />

      <section id="check" className="border-b border-line overflow-hidden scroll-mt-16">
        <div className="wrap pt-16 sm:pt-24 pb-16 sm:pb-24 flex flex-col items-center text-center">
          <p className="kicker">For creators</p>
          <h1 className="display text-[46px] sm:text-[76px] mt-4 max-w-[960px]">Make every post go viral.</h1>
          <p className="text-[17px] sm:text-[19px] text-ink-2 leading-[1.6] mt-5 max-w-[620px]">
            Your posts aren&apos;t flopping by accident. Drop your handle: see what&apos;s killing them, how far behind the top creators in your niche you are, and what to post instead.
          </p>
          <div className="mt-8 w-full">
            <form action="/check" method="get" className="w-full max-w-[560px] mx-auto">
              {src && <input type="hidden" name="src" value={src} />}
              <div className="sitebox">
                <select name="platform" defaultValue="tiktok" aria-label="Platform" className="bg-transparent text-[14px] text-ink-2 outline-none border-0 pr-1">
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                </select>
                <span className="w-px h-5 bg-line-strong" aria-hidden />
                <input name="handle" placeholder="@yourhandle" aria-label="Your handle" autoComplete="off" autoCapitalize="none" spellCheck={false} />
                <button className="btn btn-primary" type="submit">
                  Check my posts
                </button>
              </div>
              <p className="caption mt-3 text-center">Public posts only. We never ask for your login. The diagnosis is free.</p>
            </form>
            <div className="mt-16">
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-6 -mx-4 px-4 sm:overflow-visible sm:justify-center sm:items-start">
                {SAMPLE_CREATORS.map((c, i) => (
                  <div
                    key={c.handle}
                    className={`snap-center shrink-0 w-[min(300px,82vw)] rise ${["sm:-rotate-3 sm:translate-y-6", "sm:z-10", "sm:rotate-3 sm:translate-y-6"][i]}`}
                    style={{ animationDelay: `${i * 140}ms` }}
                  >
                    <DiagnosisCard handle={c.handle} platform={c.platform} followers={c.followers} stats={c.stats} killer={c.killer} fix={c.fix} benchmark={c.benchmark} voice="they" compact />
                  </div>
                ))}
              </div>
              <p className="caption mt-4">Examples from invented accounts. Yours reads your own last 12 posts.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap py-16 sm:py-24 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-center">
          <div>
            <p className="kicker">It&apos;s not the algorithm</p>
            <h2 className="display text-[30px] sm:text-[40px] mt-3">
              Same creator. Same topic. {Math.round(hit.multiple / Math.max(0.1, miss.multiple))}× apart.
            </h2>
            <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[480px]">
              The posts that flop and the ones that take off usually come from the same person, on the same topic, in the same week. What kills the flop
              is how it opens. Once you see it on your own account, you stop making it.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { p: hit, label: "Broke out", tile: "bg-stage-pos" },
              { p: miss, label: "Stalled", tile: "bg-stage-neg" },
            ].map(({ p, label, tile }) => (
              <div key={label} className="stage p-6 flex items-center gap-5">
                <span className={`w-12 h-12 rounded-[12px] shrink-0 ${tile}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-stage-ink-2">
                    {label} · @{sample.handle}
                  </div>
                  <div className="text-[20px] sm:text-[22px] font-semibold leading-[1.25] tracking-[-0.015em] mt-1">&ldquo;{p.caption}&rdquo;</div>
                </div>
                <div className="text-[26px] sm:text-[30px] font-semibold tnum tracking-[-0.03em] shrink-0">{p.multiple}×</div>
              </div>
            ))}
            <p className="caption m-0">An invented account. Engagement against its own usual post.</p>
          </div>
        </div>
      </section>

      {sample.benchmark && (
        <section className="border-b border-line bg-subtle">
          <div className="wrap py-16 sm:py-24 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-start">
            <div>
              <p className="kicker">Measured against the best</p>
              <h2 className="display text-[30px] sm:text-[40px] mt-3">You&apos;re not competing with your last post. You&apos;re competing with theirs.</h2>
              <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[480px]">
                Every check pulls the top posts in your niche right now and puts yours next to them: how far behind you are, per follower so it&apos;s fair to
                smaller accounts, who&apos;s winning, and what their openings do that yours don&apos;t.
              </p>
            </div>
            <div>
              <NicheSection b={sample.benchmark} voice="they" lines={["Every top #easyrecipes post opens on a mistake or a price (“Stop salting your pasta water like this”). @noor.cooks's flops open on a label (“Easy dinner”)."]} />
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-line">
        <div className="wrap py-16 sm:py-24">
          <p className="kicker">How it works</p>
          <h2 className="display text-[30px] sm:text-[40px] mt-3 max-w-[680px]">Stop posting flops.</h2>
          <ol className="list-none p-0 m-0 mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((t, i) => (
              <li key={t.title}>
                <span className={`text-[44px] font-semibold tnum tracking-[-0.04em] leading-none ${["text-neg", "text-neg", "text-pos"][i]}`}>{i + 1}</span>
                <h3 className="heading text-[19px] mt-4">{t.title}</h3>
                <p className="text-[15px] text-ink-2 leading-[1.65] mt-2">{t.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-subtle border-b border-line">
        <div className="wrap py-16 sm:py-24">
          <p className="kicker">Why most posts don&apos;t travel</p>
          <h2 className="display text-[28px] sm:text-[34px] mt-3 max-w-[640px]">Posting more won&apos;t make you go viral. Knowing which posts travel will.</h2>
          <ol className="list-none p-0 m-0 mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {TRUTHS.map((t, i) => (
              <li key={t.title} className="border-t border-line pt-6">
                <span className="text-[13px] font-medium text-ink-3 tnum">0{i + 1}</span>
                <h3 className="heading text-[17px] mt-3">{t.title}</h3>
                <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-2">{t.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="wrap py-16 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-10 md:grid-cols-2">
          <div>
            <p className="kicker">How the check works</p>
            <h2 className="display text-[28px] sm:text-[34px] mt-3">Measured against you, not a benchmark.</h2>
          </div>
          <dl className="m-0 flex flex-col gap-5 text-[14.5px] leading-[1.65]">
            {[
              ["Your usual", "The median likes, comments and shares across your last 12 public posts. Half your posts do better, half do worse."],
              ["Broke out", "A post at twice your usual or more. It reached past the people who always engage."],
              ["Stalled", "A post at half your usual or less. Even your regulars passed on it."],
              ["What we don't see", "Reach, saves and watch time are private to your account, so the check never claims them."],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold">{k}</dt>
                <dd className="m-0 text-ink-2 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-16 sm:py-24">
          <div className="stage p-8 sm:p-14 flex flex-col items-center text-center">
            <h2 className="text-[34px] sm:text-[52px] font-semibold tracking-[-0.035em] leading-[1.04] m-0 max-w-[720px]">Find out why your posts flop.</h2>
            <p className="text-[16px] sm:text-[17px] text-stage-ink-2 mt-4 mb-0 max-w-[520px] leading-[1.6]">
              Then fix it before you post the next one. Free, no account, about a minute.
            </p>
            <a href="/check" className="btn btn-lg mt-8 bg-stage-ink text-stage hover:opacity-90">
              Check my posts
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-line mt-auto">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between sm:items-center text-[13px] text-ink-3">
          <div className="flex items-center gap-4">
            <Brand size={12} />
            <span>© {new Date().getFullYear()} TRND</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-ink">
              For brands
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
