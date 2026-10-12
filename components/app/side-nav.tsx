"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  meta?: string;
  alert?: boolean;
}

/** Sidebar links, marked current by path. */
export function SideLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href} className="side-link" aria-current={path === it.href ? "page" : undefined}>
            <span className="flex items-center gap-2 min-w-0">
              {it.alert && <i className="dot dot-rec" style={{ width: 5, height: 5, boxShadow: "none" }} />}
              <span className="truncate">{it.label}</span>
            </span>
            {it.meta && <span className="font-mono text-[11px] text-ink-3">{it.meta}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The mobile tab row. */
export function TopTabs({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-3 -mb-px">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`shrink-0 px-3 py-1.5 rounded-md text-[13.5px] ${path === it.href ? "bg-bg-2 text-ink" : "text-ink-2"}`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
