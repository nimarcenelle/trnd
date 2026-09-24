"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { FOCUS_MODE } from "@/lib/focus";
import { sentenceCase } from "@/lib/text";

// Five tabs for a one-decision product (two while FOCUS_MODE hides the rest): the week's tests, the tests in
// progress, the record they built, the analysis they are written against,
// and the settings that feed them. Nothing else is a route.
const LINKS = [
  // The week is the ranked list now; each pick's own page sits under it, so
  // the tab stays lit while an owner reads one.
  { href: "/app/picks", label: "This week" },
  { href: "/app/campaigns", label: "Campaigns", hidden: FOCUS_MODE },
  // The number the product is judged on: how the picks that ran turned out.
  { href: "/app/record", label: "Track record", hidden: FOCUS_MODE },
  // The founding analysis is one of the four things the product IS, and it
  // was reachable only by a link buried on the pick screen and in Settings.
  { href: "/app/snapshot", label: "Snapshot", hidden: FOCUS_MODE },
  { href: "/app/settings", label: "Settings" },
].filter((l) => !l.hidden);

export default function AppNav({
  businessName,
  signOut,
}: {
  businessName: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  return (
    <nav className="app-shell-nav">
      <div className="app-shell-nav__left">
        <Brand href="/app/picks" size={16} />
        <span className="app-shell-nav__biz mono-label">{sentenceCase(businessName)}</span>
      </div>
      <div className="app-tabs" role="navigation" aria-label="App sections">
        {LINKS.map((l) => {
          // Segment match, not prefix: /app/picks must not light up for a
          // sibling route that merely starts with the same letters.
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link key={l.href} href={l.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="app-shell-nav__right">
        <ThemeToggle />
        <form action={signOut}>
          <button type="submit" className="btn btn-ghost btn-sm">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}