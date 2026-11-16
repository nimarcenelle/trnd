import Link from "next/link";

import AccountNav from "@/components/essayodds/account-nav";
import SiteLinks from "@/components/essayodds/site-links";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

/** The marketing pages' top bar. Log in is optional: the odds flow needs no account. */
export default function SiteNav({ links = true }: { links?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur-md">
      <div className="wrap flex items-center justify-between h-16">
        <div className="flex items-center gap-8">
          <Brand />
          {links && <SiteLinks />}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountNav />
          <Link href="/odds" className="btn btn-primary btn-sm">
            Get my odds
          </Link>
        </div>
      </div>
    </header>
  );
}
