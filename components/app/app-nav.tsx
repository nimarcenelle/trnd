"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

const LINKS = [
  { href: "/app", label: "This week" },
  { href: "/app/report", label: "Report" },
  { href: "/app/ask", label: "Ask" },
  { href: "/app/opportunities", label: "Opportunities" },
  { href: "/app/campaigns", label: "Campaigns" },
  { href: "/app/results", label: "Results" },
  { href: "/app/snapshot", label: "Snapshot" },
  { href: "/app/settings", label: "Settings" },
] as const;

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
        <Brand href="/app" size={16} />
        <span className="app-shell-nav__biz mono-label">{businessName}</span>
      </div>
      <div className="app-tabs" role="navigation" aria-label="App sections">
        {LINKS.map((l) => {
          const active = l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
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