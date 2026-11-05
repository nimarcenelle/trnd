import { notFound } from "next/navigation";

import EssayForm from "@/components/admitted/essay-form";
import SiteNav from "@/components/site-nav";
import { accessLink, paidSession } from "@/lib/admitted/access";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Review your essay" };

const INCLUDED = ["A scored review of every draft, line by line", "A rewrite from your own draft, and revisions through the cycle", "Personal statement and every supplement"];

export default async function EssayPage() {
  if (!isEssayOpen) notFound();
  const session = await paidSession();
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="wrap py-14">
        <p className="kicker">Essays</p>
        <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Your essay, reviewed line by line.</h1>
        {session ? (
          <>
            <EssayForm />
            <div className="well p-4 mt-6 text-[13px]">
              <p className="font-medium">Your access link</p>
              <p className="text-ink-2 mt-1">Save it. There is no account, and this link is how you get back in on another device. Anyone with it can use your access.</p>
              <p className="mt-2 break-all text-ink-2">{accessLink(session, env.siteUrl)}</p>
            </div>
          </>
        ) : (
          <div className="card mt-8 max-w-[440px] p-8">
            <div className="text-[14px] font-semibold text-[var(--kicker)]">Essays, reviewed and rewritten</div>
            <div className="text-[40px] font-semibold tnum mt-3">$299</div>
            <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-3 text-[14px]">
              {INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <form action="/api/essays/checkout" method="post">
              <button className="btn btn-primary btn-lg w-full mt-8" type="submit">
                Pay $299
              </button>
            </form>
            <p className="caption text-center mt-3">Paid once per cycle. No subscription.</p>
          </div>
        )}
      </main>
    </div>
  );
}
