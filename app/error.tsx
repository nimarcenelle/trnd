"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap py-[96px] px-8 max-w-[560px]">
      <div className="card-lg py-8 px-[30px]">
        <span className="eyebrow m-0">Something went wrong</span>
        <h1 className="h-disp text-[26px] mx-0 mt-2 mb-[10px]">This page did not load.</h1>
        <p className="text-ink-soft leading-[1.6] mx-0 mt-0 mb-6 text-[14.5px]">
          The fault is on our side and your data is intact. Try again, and if it happens twice, sign out and back in.
        </p>
        <button className="btn btn-primary btn-sm" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
