"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="label text-rec">Signal lost</span>
      <h1 className="disp text-[30px]">This page didn&apos;t load.</h1>
      <p className="text-ink-2 max-w-[440px]">The fault is on our side and your data is intact. Try again; if it happens twice, sign out and back in.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
