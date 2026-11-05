import Link from "next/link";

import Brand from "@/components/brand";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center bg-subtle">
      <Brand />
      <div>
        <p className="caption tnum">404</p>
        <h1 className="section-title text-[32px] mt-2">Page not found</h1>
        <p className="text-[16px] text-ink-2 mt-2">The link may be old or mistyped.</p>
      </div>
      <Link href="/" className="btn btn-primary">
        Back to Admitted
      </Link>
    </main>
  );
}
