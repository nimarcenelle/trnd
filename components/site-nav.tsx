import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

/** The marketing pages' top bar. */
export default function SiteNav({ links = true }: { links?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="wrap flex items-center justify-between h-14">
        <div className="flex items-center gap-10">
          <Brand />
          {links && (
            <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-ink-2">
              <Link href="/#how" className="hover:text-ink">
                How it works
              </Link>
              <Link href="/#features" className="hover:text-ink">
                Features
              </Link>
              <Link href="/#pricing" className="hover:text-ink">
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
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
