"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

const LINKS = [
  { href: "/app", label: "This week" },
  { href: "/app/opportunities", label: "Opportunities" },
  { href: "/app/results", label: "Results" },
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
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 24px",
        background: "var(--nav-bg)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--line)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
        <Brand href="/app" size={16} />
        <span
          className="mono-label"
          style={{ borderLeft: "1px solid var(--line-strong)", paddingLeft: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}
        >
          {businessName}
        </span>
      </div>
      <div className="app-nav" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {LINKS.map((l) => {
          const active = l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "active" : undefined}
              style={{
                fontFamily: "var(--body)",
                fontSize: 13.5,
                padding: "7px 12px",
                borderRadius: 999,
                color: active ? "var(--ink)" : "var(--ink-soft)",
                background: active ? "var(--bg-2)" : "transparent",
              }}
            >
              {l.label}
            </Link>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 10 }}>
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
