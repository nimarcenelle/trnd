"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap py-[64px] px-8 max-w-[560px]">
      <div className="panel">
        <span className="eyebrow m-0">Something went wrong</span>
        <h1 className="h-disp text-[24px] mx-0 mt-2 mb-[10px]">This screen did not load.</h1>
        <p className="text-ink-soft leading-[1.6] mx-0 mt-0 mb-6 text-[14.5px]">
          Your picks, campaigns and results are intact. Try again, or go back to this week.
        </p>
        <div className="flex gap-3">
          <button className="btn btn-primary btn-sm" onClick={reset}>
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point: it resets whatever broke */}
          <a href="/app/picks" className="btn btn-ghost btn-sm">
            This week
          </a>
        </div>
      </div>
    </div>
  );
}
