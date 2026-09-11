import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap py-[96px] px-8 max-w-[560px]">
      <span className="eyebrow">404</span>
      <h1 className="h-disp text-[28px] mx-0 mt-0 mb-[10px]">
        That page isn&apos;t here.
      </h1>
      <p className="text-ink-soft leading-[1.6] mx-0 mt-0 mb-6">
        The link may be old, or the campaign may belong to another account.
      </p>
      <Link href="/" className="btn btn-primary btn-sm">
        Back to TRND
      </Link>
    </main>
  );
}
