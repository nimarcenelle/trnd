import SiteNav from "@/components/site-nav";
import WaitlistForm from "@/components/creator/waitlist-form";
import { IconCheck } from "@/components/icons";
import { cleanSrc, isHandle } from "@/lib/creator/check";
import { CREATOR_PRICE } from "@/lib/creator/funnel";
import { normHandle } from "@/lib/social/read";

export const metadata = { title: "The creator plan — TRND", robots: { index: false } };

/**
 * Where "Start free" lands while the creator plan is being built. It says so
 * plainly and asks for an email: the people who leave one are the first the
 * plan opens to, and the count is the demand test.
 */
export default async function CreatorPlanPage({ searchParams }: PageProps<"/creators/plan">) {
  const q = await searchParams;
  const raw = normHandle(typeof q.handle === "string" ? q.handle : "");
  const handle = isHandle(raw) ? raw : "";
  const platform = q.platform === "instagram" ? "instagram" : "tiktok";
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <div className="wrap py-16 sm:py-24 max-w-[620px]">
        <p className="kicker">Creator plan · early access</p>
        <h1 className="display text-[32px] sm:text-[40px] mt-3">You&apos;re early. The creator plan opens soon.</h1>
        <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">
          We&apos;re building it now and opening it to creators a few at a time. Leave your email and you&apos;ll be among the first, with the first
          month free. Until then we&apos;ll re-check {handle ? `@${handle}` : "your posts"} every week, free.
        </p>
        <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-2.5">
          {["Up to 10 creators you compete with, read daily", "Their breakouts as they happen, with the hook and format", "Three hooks a week built on what's working now", `${CREATOR_PRICE}/month after the free month`].map((x) => (
            <li key={x} className="flex gap-2.5 text-[14.5px]">
              <IconCheck className="text-brand mt-[3px] shrink-0" />
              {x}
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <WaitlistForm handle={handle} platform={platform} src={cleanSrc(q.src)} />
        </div>
      </div>
    </div>
  );
}
