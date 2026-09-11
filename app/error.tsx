"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap py-[96px] px-8 max-w-[560px]">
      <span className="eyebrow text-red">
        Something broke
      </span>
      <h1 className="h-disp text-[28px] mx-0 mt-0 mb-[10px]">
        Not you — us.
      </h1>
      <p className="text-ink-soft leading-[1.6] mx-0 mt-0 mb-6">
        The page hit an error. Your data is fine. Try again — if it keeps happening, sign out and
        back in.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
