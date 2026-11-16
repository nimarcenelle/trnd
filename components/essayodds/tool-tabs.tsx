"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TOOLS = [
  { href: "/odds", label: "Odds" },
  { href: "/essay", label: "Essays" },
  { href: "/activities", label: "Activities" },
  { href: "/essay/final", label: "Final Read" },
];

const isActive = (path: string, href: string) => (href === "/essay" ? path === "/essay" : path === href || path.startsWith(`${href}/`));

/** The four tools as one segmented control, with the current one raised. */
export default function ToolTabs({ className = "" }: { className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Tools" className={`flex items-center gap-0.5 p-[3px] rounded-[10px] bg-muted overflow-x-auto ${className}`}>
      {TOOLS.map((t) => {
        const on = isActive(path, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`h-8 px-3.5 shrink-0 inline-flex items-center rounded-[8px] text-[13px] font-medium transition-colors ${on ? "bg-bg text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
