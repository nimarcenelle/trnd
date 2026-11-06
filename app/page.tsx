import Link from "next/link";

import Brand from "@/components/brand";
import HandleStep from "@/components/preview/handle-step";

/**
 * The first screen. Visitors come from an ad or a post and already know what
 * TRND does, so it asks one thing: the handle. The read runs from there, one
 * question a screen (/start/[id]), to what's wrong with their videos.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { src } = await searchParams;
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="h-1 bg-muted">
        <div className="h-full w-1/4 bg-brand" />
      </div>
      <header className="wrap flex items-center justify-between h-14">
        <Brand />
        <Link href="/login" className="btn btn-ghost btn-sm">
          Sign in
        </Link>
      </header>
      <main className="flex-1 grid items-center">
        <div className="rise wrap max-w-[680px] py-12">
          <div className="text-[13px] text-brand font-medium tnum mb-3">1 → 4</div>
          <h1 className="display text-[clamp(38px,6.5vw,64px)]">Make every post go viral.</h1>
          <p className="text-ink-2 text-[17.5px] sm:text-[19px] leading-[1.55] mt-4 mb-10 max-w-[52ch]">
            Your posts aren&apos;t flopping by accident. Drop your TikTok handle and we&apos;ll show you what&apos;s holding them back.
          </p>
          <HandleStep src={typeof src === "string" ? src.slice(0, 40) : undefined} />
          <p className="caption mt-6">Free. No TikTok login. We only read your public videos.</p>
        </div>
      </main>
      <footer className="wrap py-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-3">
        <Link href="/pricing" className="hover:text-ink">
          How it works and pricing
        </Link>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
