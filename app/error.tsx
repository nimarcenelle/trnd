"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-5 px-6 text-center bg-subtle">
      <h1 className="heading text-[24px]">Something went wrong</h1>
      <p className="text-ink-2 max-w-[420px]">The problem is on our side and your data is safe. Try again, and if it keeps happening, sign out and back in.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
