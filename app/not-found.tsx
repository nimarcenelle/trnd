import Link from "next/link";

import Brand from "@/components/brand";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center bg-subtle">
      <Brand />
      <div>
        <p className="caption">404</p>
        <h1 className="heading text-[24px] mt-2">Page not found</h1>
        <p className="text-ink-2 mt-2">The link may be old, or it may belong to another account.</p>
      </div>
      <Link href="/" className="btn btn-primary">
        Back to TRND
      </Link>
    </main>
  );
}
