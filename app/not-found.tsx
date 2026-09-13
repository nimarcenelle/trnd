import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap py-[96px] px-8 max-w-[560px]">
      <div className="card-lg py-8 px-[30px]">
        <span className="eyebrow m-0">Not found</span>
        <h1 className="h-disp text-[26px] mx-0 mt-2 mb-[10px]">There is no page here.</h1>
        <p className="text-ink-soft leading-[1.6] mx-0 mt-0 mb-6 text-[14.5px]">
          The link may be old, or it may belong to another account.
        </p>
        <Link href="/" className="btn btn-primary btn-sm">
          Back to TRND
        </Link>
      </div>
    </main>
  );
}
