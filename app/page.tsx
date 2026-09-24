import Link from "next/link";

import Brand from "@/components/brand";
import FullLanding from "@/components/landing/full-landing";
import CategoryRead from "@/components/read/category-read";
import ThemeToggle from "@/components/theme-toggle";
import { isPilotGated } from "@/lib/env";
import { FOCUS_MODE } from "@/lib/focus";

import "./landing.css";
import "./read.css";

// The page is one input: a store's address, and a minute later the
// brand's category read back to it (lib/read/run.ts). Every claim on it is
// counted from the brand's own site and the public Ad Library, and says
// what it can't know. The full pitch page is kept behind FOCUS_MODE.

export default function Home() {
  if (!FOCUS_MODE) return <FullLanding />;
  return (
    <>
      <nav className="nav">
        <Brand href={null} />
        <div className="nav__right">
          <Link className="font-body text-[14px] text-ink-soft" href="/login">
            Sign in
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <main className="read-page">
        <header className="read-hero">
          <div className="eyebrow">For DTC brands on Meta</div>
          <h1>
            See what your category <em>keeps paying for.</em>
          </h1>
          <p className="read-hero__sub">
            Paste your store. In about a minute: your live ads, your rivals&rsquo; longest-running ads, the opening they lean on that you
            don&rsquo;t, and the first test to fill it, shot by shot.
          </p>
          <CategoryRead gated={isPilotGated} />
        </header>
      </main>

      <footer className="read-footer">
        <span>TRND · Know what to make next.</span>
        <span>
          <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
        </span>
      </footer>
    </>
  );
}
