"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
        <Link
          href="/app"
          style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--disp)", fontWeight: 800, fontSize: 18 }}
        >
          <i style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 0 4px var(--mint-glow)" }} />
          TRND
        </Link>
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
