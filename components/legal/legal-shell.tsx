import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

/** Shared frame for /terms and /privacy — plain reading pages, both themes. */
export default function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh flex flex-col">
      <nav className="flex items-center justify-between py-4 px-8 border-b border-line"
       
      >
        <Brand />
        <ThemeToggle />
      </nav>
      <article style={{ flex: 1, width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 24px 72px" }}>
        <span className="eyebrow">Legal</span>
        <h1 className="h-disp" style={{ fontSize: "clamp(28px,4vw,40px)", margin: "6px 0 6px" }}>{title}</h1>
        <p className="mono-label mb-[34px]">Last updated {updated}</p>
        <div className="legal-body">{children}</div>
        <p className="mt-[44px] text-[13px] text-ink-faint">
          Questions? Write to us via the <Link className="text-amber" href="/#demo">contact form</Link>. See also{" "}
          <Link className="text-amber" href="/terms">Terms</Link> ·{" "}
          <Link className="text-amber" href="/privacy">Privacy</Link>.
        </p>
      </article>
    </main>
  );
}
