"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/essays", label: "Essay prompts" },
  { href: "/activities", label: "Activities" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

/** The marketing links, with the page you're on marked. */
export default function SiteLinks() {
  const path = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1 text-[14px]">
      {LINKS.map((l) => {
        const on = l.href !== "/#faq" && (path === l.href || path.startsWith(`${l.href}/`));
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`h-9 px-3 inline-flex items-center rounded-[8px] transition-colors ${on ? "text-ink font-medium bg-subtle" : "text-ink-2 hover:text-ink hover:bg-subtle"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
