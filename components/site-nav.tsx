import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

/** The marketing pages' top bar. No sign-in yet: the free odds need no account. */
export default function SiteNav({ links = true }: { links?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur-md">
      <div className="wrap flex items-center justify-between h-14">
        <div className="flex items-center gap-10">
          <Brand />
          {links && (
            <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-ink-2">
              <Link href="/#how" className="hover:text-ink">
                How it works
              </Link>
              <Link href="/essays" className="hover:text-ink">
                Essay prompts
              </Link>
              <Link href="/activities" className="hover:text-ink">
                Activities
              </Link>
              <Link href="/#data" className="hover:text-ink">
                The data
              </Link>
              <Link href="/pricing" className="hover:text-ink">
                Pricing
              </Link>
              <Link href="/#faq" className="hover:text-ink">
                FAQ
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/essay" className="btn btn-ghost btn-sm hidden sm:inline-flex">
            Review my essay free
          </Link>
          <Link href="/odds" className="btn btn-primary btn-sm">
            See my odds
          </Link>
        </div>
      </div>
    </header>
  );
}
