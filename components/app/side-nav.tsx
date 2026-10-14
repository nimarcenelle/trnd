"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconBrand, IconBriefing, IconRivals, IconSettings, IconTimeline } from "@/components/icons";

import Avatar from "./avatar";

export interface RivalLink {
  id: string;
  name: string;
  live: number;
  error: boolean;
}

const MAIN = [
  { href: "/app", label: "Briefing", icon: IconBriefing },
  { href: "/app/timeline", label: "Timeline", icon: IconTimeline },
  { href: "/app/brand", label: "Your brand", icon: IconBrand },
  { href: "/app/settings", label: "Rivals & settings", icon: IconSettings },
];

/** The sidebar's links, marked current by path. */
export function SideNav({ rivals, setup }: { rivals: RivalLink[]; setup?: boolean }) {
  const path = usePathname();
  const items = setup ? [{ href: "/app/setup", label: "Set up", icon: IconRivals }] : MAIN;
  return (
    <nav className="flex flex-col gap-6">
      <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="nav-item" aria-current={path === href ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      {rivals.length > 0 && (
        <div>
          <div className="px-2.5 mb-1.5 flex justify-between text-[12px] text-ink-3">
            <span>Rivals</span>
            <span>Live ads</span>
          </div>
          <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
            {rivals.map((r) => {
              const href = `/app/rivals/${r.id}`;
              return (
                <li key={r.id}>
                  <Link href={href} className="nav-item" aria-current={path === href ? "page" : undefined}>
                    <Avatar name={r.name} size={18} />
                    <span className="truncate flex-1">{r.name}</span>
                    {r.error ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-neg" title="Can't read this rival" />
                    ) : (
                      <span className="text-[12px] text-ink-3 tnum">{r.live}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

/** The mobile tab row. */
export function TopTabs({ rivals }: { rivals: RivalLink[] }) {
  const path = usePathname();
  const items = [...MAIN.map((m) => ({ href: m.href, label: m.label })), ...rivals.map((r) => ({ href: `/app/rivals/${r.id}`, label: r.name }))];
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-2.5">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`shrink-0 h-7 px-2.5 inline-flex items-center rounded-md text-[13px] font-medium ${path === it.href ? "bg-muted text-ink" : "text-ink-2"}`}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
