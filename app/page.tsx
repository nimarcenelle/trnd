import Link from "next/link";

import DiagnosisCard from "@/components/app/diagnosis-card";
import FunnelShell, { StepNo } from "@/components/preview/funnel-shell";
import HandleStep from "@/components/preview/handle-step";
import { LENA, LENA_DIAGNOSIS, LENA_GAP } from "@/components/sample/lena";

/**
 * The first screen. Visitors come from an ad or a post and already know what
 * TRND does, so it asks one thing: the handle. Beside it on a wide screen, a
 * sample of what they'll see at the end (an invented account), what's killing
 * the posts kept blurred as it will be for them.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { src } = await searchParams;
  return (
    <FunnelShell step={1}>
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] items-center">
        <div className="max-w-[640px]">
          <StepNo n={1} />
          <h1 className="display text-[clamp(40px,6.6vw,68px)]">Make every post go viral.</h1>
          <p className="text-ink-2 text-[18px] sm:text-[19.5px] leading-[1.5] mt-4 mb-10 max-w-[48ch]">
            Your posts aren&apos;t flopping by accident. Drop your TikTok handle and we&apos;ll show you what&apos;s holding them back.
          </p>
          <HandleStep src={typeof src === "string" ? src.slice(0, 40) : undefined} />
          <ul className="list-none m-0 p-0 mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-ink-2">
            {["About a minute", "No TikTok login", "Public videos only", "Free"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand" aria-hidden>
                  <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <figure className="m-0 max-lg:hidden">
          <div className="rotate-[2deg] shadow-[var(--shadow-lg)] rounded-[18px]">
            <DiagnosisCard handle={LENA.handle} followers={LENA.followers} d={LENA_DIAGNOSIS} gap={LENA_GAP} locked compact />
          </div>
          <figcaption className="caption mt-5 text-center">What you&apos;ll see. An example account.</figcaption>
        </figure>
      </div>
      <nav className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-3">
        <Link href="/pricing" className="hover:text-ink">
          How it works and pricing
        </Link>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </nav>
    </FunnelShell>
  );
}
