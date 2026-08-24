import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap" style={{ padding: "96px 32px", maxWidth: 560 }}>
      <span className="eyebrow">404</span>
      <h1 className="h-disp" style={{ fontSize: 28, margin: "0 0 10px" }}>
        That page isn&apos;t here.
      </h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: "0 0 24px" }}>
        The link may be old, or the campaign may belong to another account.
      </p>
      <Link href="/" className="btn btn-primary btn-sm">
        Back to TRND
      </Link>
    </main>
  );
}
