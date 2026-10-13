import Link from "next/link";

import SiteNav from "@/components/site-nav";

/** Shared frame for /terms and /privacy. */
export default function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <article className="flex-1 w-full max-w-[680px] mx-auto px-6 pt-16 pb-24">
        <h1 className="display text-[36px]">{title}</h1>
        <p className="caption mt-3 mb-8">Last updated {updated}</p>
        <div className="legal-body">{children}</div>
        <p className="mt-12 text-[13px] text-ink-3">
          Questions? Email{" "}
          <a className="text-ink underline" href="mailto:hello@usetrnd.com">
            hello@usetrnd.com
          </a>
          . See also the{" "}
          <Link className="text-ink underline" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="text-ink underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
