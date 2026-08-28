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
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Brand />
        <ThemeToggle />
      </nav>
      <article style={{ flex: 1, width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 24px 72px" }}>
        <span className="eyebrow">Legal</span>
        <h1 className="h-disp" style={{ fontSize: "clamp(28px,4vw,40px)", margin: "6px 0 6px" }}>{title}</h1>
        <p className="mono-label" style={{ marginBottom: 34 }}>Last updated {updated}</p>
        <div className="legal-body">{children}</div>
        <p style={{ marginTop: 44, fontSize: 13, color: "var(--ink-faint)" }}>
          Questions? Write to us via the <Link href="/#demo" style={{ color: "var(--amber)" }}>contact form</Link>. See also{" "}
          <Link href="/terms" style={{ color: "var(--amber)" }}>Terms</Link> ·{" "}
          <Link href="/privacy" style={{ color: "var(--amber)" }}>Privacy</Link>.
        </p>
      </article>
    </main>
  );
}
