import Link from "next/link";

import Brand from "@/components/brand";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-8 px-6 text-center gridbg">
      <Brand />
      <div>
        <span className="label">404 · No signal</span>
        <h1 className="disp text-[32px] mt-3">There&apos;s nothing on this camera.</h1>
        <p className="text-ink-2 mt-3">The link may be old, or it may belong to another account.</p>
      </div>
      <Link href="/" className="btn btn-primary">
        Back to TRND
      </Link>
    </main>
  );
}
