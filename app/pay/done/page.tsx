import Link from "next/link";
import { notFound } from "next/navigation";

import CopyLink from "@/components/admitted/copy-link";
import SiteNav from "@/components/site-nav";
import { accessFor, accessLink } from "@/lib/admitted/access";
import { emailAccessOnce } from "@/lib/admitted/access-email";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Send the link · EssayOdds", robots: { index: false } };

/** Where a parent lands after paying: the link to send, and nothing set in their own browser. */
export default async function PayDonePage({ searchParams }: PageProps<"/pay/done">) {
  if (!isEssayOpen) notFound();
  const { session_id } = await searchParams;
  const id = typeof session_id === "string" ? session_id : "";
  const access = await accessFor(id).catch(() => null);
  const paid = access !== null;
  if (access) await emailAccessOnce({ id, ...access }).catch((err) => console.error("[access-email]", (err as Error).message));
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <main className="flex-1 wash-top">
        <div className="wrap py-16 sm:py-24 max-w-[640px]">
          {paid ? (
            <>
              <p className="kicker">Paid</p>
              <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Send this link to your student.</h1>
              <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">We also emailed it to you. Opening it unlocks their essays on any device. Anyone with the link can use the access, so send it only to them.{access?.until ? ` It works until ${access.until.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })}.` : ""}</p>
              <div className="card p-5 mt-8">
                <CopyLink url={accessLink(id, env.siteUrl)} />
              </div>
              {access?.recurring && (
                <form action="/api/essays/portal" method="post" className="mt-4">
                  <input type="hidden" name="session_id" value={id} />
                  <button type="submit" className="text-[13px] text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]">
                    Manage or cancel the subscription
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <h1 className="section-title text-[32px] mt-3">We could not confirm that payment.</h1>
              <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">
                If you were charged, write to{" "}
                <a className="underline" href="mailto:hello@usetrnd.com">
                  hello@usetrnd.com
                </a>{" "}
                and we will send the link. Or <Link className="underline" href="/pay">start again</Link>.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
