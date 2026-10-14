import Link from "next/link";

import PreviewStart from "@/components/preview-start";
import SiteNav from "@/components/site-nav";
import { PREVIEW_RIVALS } from "@/lib/preview";

export const metadata = { title: "Free competitor report — TRND" };

const ERRORS: Record<string, string> = {
  invalid: "Enter your website, like yourbrand.com.",
  unconfigured: "Free reports aren't available right now. Start a trial and TRND reads your market as soon as you're in.",
  visitor_limit: "You've run 3 free reports today. Start a trial to watch your competitors every day.",
  daily_limit: "Free reports are full for today. Come back tomorrow, or start a trial and your first report runs right away.",
};

/** Where the free report form lands when it can't start: the box again, with what went wrong. */
export default async function ReportStartPage({ searchParams }: PageProps<"/report">) {
  const { site, error } = await searchParams;
  const typed = typeof site === "string" ? site : "";
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="wrap flex-1 pt-20 sm:pt-28 pb-24 flex flex-col items-center text-center">
        <p className="kicker">Free report</p>
        <h1 className="display text-[34px] sm:text-[44px] mt-3 max-w-[720px]">See what your competitors are running right now.</h1>
        <p className="text-[16px] text-ink-2 leading-[1.6] mt-4 max-w-[560px]">
          Enter your website. TRND finds your {PREVIEW_RIVALS} closest competitors, reads every ad they&apos;re running, and tells you where to move first. No account needed.
        </p>
        <div className="mt-8 w-full flex justify-center">
          <PreviewStart site={typed} />
        </div>
        {message && <p className="form-error mt-4 max-w-[460px]">{message}</p>}
        {(error === "visitor_limit" || error === "daily_limit" || error === "unconfigured") && (
          <Link href={`/signup${typed ? `?site=${encodeURIComponent(typed)}` : ""}`} className="btn btn-secondary mt-4">
            Start free trial
          </Link>
        )}
      </main>
    </div>
  );
}
