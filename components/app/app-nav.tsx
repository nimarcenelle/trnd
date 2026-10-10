"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Brand from "@/components/brand";
import { FOCUS_MODE } from "@/lib/focus";
import { sentenceCase } from "@/lib/text";

// The sidebar of the control room. Competitors is home: every rival's
// paid ads against yours, read daily. Briefs turn what you're missing into
// tests; Settings feeds both. The older tabs are hidden while FOCUS_MODE
// is on and still work by URL.
const ICONS: Record<string, React.ReactNode> = {
  "/app/rivals": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  ),
  "/app/picks": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h4M9 3v5l-4.5 7.5A1.5 1.5 0 0 0 5.8 18h8.4a1.5 1.5 0 0 0 1.3-2.5L11 8V3" />
    </svg>
  ),
  "/app/settings": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
    </svg>
  ),
};

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
  website,
  watching,
  signOut,
}: {
  businessName: string;
  website: string | null;
  /** How many competitors are on camera. */
  watching: number;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  return (
    <aside className="ap-side">
      <div>
        <Brand href="/app/rivals" size={17} live />
        <div className="ap-side__stat">
          <i aria-hidden="true" />
          {watching > 0 ? `Rec · ${watching} competitor${watching === 1 ? "" : "s"} on camera` : "Rec · naming competitors"}
        </div>
      </div>
      <nav className="ap-nav" aria-label="App sections">
        {LINKS.map((l) => {
          // Segment match, not prefix: /app/picks must not light up for a
          // sibling route that merely starts with the same letters.
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link key={l.href} href={l.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
              {ICONS[l.href] ?? null}
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="ap-side__biz">
        <b>{sentenceCase(businessName)}</b>
        {website ? <small>{website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</small> : null}
        <form action={signOut}>
          <button type="submit" className="rd-btn rd-btn--ghost rd-btn--sm">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
