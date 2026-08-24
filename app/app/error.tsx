"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap" style={{ padding: "64px 32px", maxWidth: 560 }}>
      <span className="eyebrow" style={{ color: "var(--red)" }}>
        Something broke
      </span>
      <h1 className="h-disp" style={{ fontSize: 26, margin: "0 0 10px" }}>
        This screen hit an error.
      </h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: "0 0 24px" }}>
        Your campaigns and results are safe. Try again, or head back to this week&apos;s
        recommendation.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={reset}>
          Try again
        </button>
        <a href="/app" className="btn btn-ghost btn-sm">
          This week
        </a>
      </div>
    </div>
  );
}
