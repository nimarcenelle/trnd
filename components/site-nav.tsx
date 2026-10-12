import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

/** The marketing pages' top bar. */
export default function SiteNav({ links = true }: { links?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="wrap flex items-center justify-between h-16">
        <Brand live />
        <nav className="flex items-center gap-2 sm:gap-6">
          {links && (
            <span className="hidden md:flex items-center gap-6 text-[14px] text-ink-2">
              <Link href="/#how" className="hover:text-ink">
                How it works
              </Link>
              <Link href="/#report" className="hover:text-ink">
                The report
              </Link>
              <Link href="/#pricing" className="hover:text-ink">
                Pricing
              </Link>
            </span>
          )}
          <ThemeToggle />
          <Link href="/login" className="btn btn-quiet btn-sm">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm hidden sm:inline-flex">
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}
