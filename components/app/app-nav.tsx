"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Brand from "@/components/brand";
import { FOCUS_MODE } from "@/lib/focus";
import { sentenceCase } from "@/lib/text";

// Competitors is home: every rival's paid ads against yours, read daily.
// Briefs turn what you're missing into tests; Settings feeds both. The
// older tabs are hidden while FOCUS_MODE is on and still work by URL.
const LINKS = [
  { href: "/app/rivals", label: "Competitors" },
  // Each brief's own page sits under /app/picks, so the tab stays lit.
  { href: "/app/picks", label: "Briefs" },
  { href: "/app/campaigns", label: "Campaigns", hidden: FOCUS_MODE },
  { href: "/app/record", label: "Track record", hidden: FOCUS_MODE },
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
    <nav className="rd-nav rd-appnav">
      <div className="rd-appnav__left">
        <Brand href="/app/rivals" size={16} live />
        <span className="rd-appnav__biz">{sentenceCase(businessName)}</span>
      </div>
      <div className="rd-appnav__tabs" role="navigation" aria-label="App sections">
        {LINKS.map((l) => {
          // Segment match, not prefix: /app/picks must not light up for a
          // sibling route that merely starts with the same letters.
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link key={l.href} href={l.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </div>
      <form action={signOut} className="rd-appnav__right">
        <button type="submit" className="rd-btn rd-btn--ghost rd-btn--sm">
          Sign out
        </button>
      </form>
    </nav>
  );
}
