import Link from "next/link";

import SiteNav from "@/components/site-nav";

/** Shared frame for /terms and /privacy. */
export default function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <article className="flex-1 w-full max-w-[720px] mx-auto px-6 pt-16 pb-24">
        <span className="eyebrow">Legal</span>
        <h1 className="disp text-[clamp(32px,4.5vw,48px)] mt-4">{title}</h1>
        <p className="label mt-3 mb-10">Last updated {updated}</p>
        <div className="legal-body">{children}</div>
        <p className="mt-12 text-[13px] text-ink-3">
          Questions? Write to{" "}
          <a className="text-mint" href="mailto:hello@usetrnd.com">
            hello@usetrnd.com
          </a>
          . See also{" "}
          <Link className="text-mint" href="/terms">
            Terms
          </Link>{" "}
          ·{" "}
          <Link className="text-mint" href="/privacy">
            Privacy
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
