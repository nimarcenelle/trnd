"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap" style={{ padding: "96px 32px", maxWidth: 560 }}>
      <span className="eyebrow" style={{ color: "var(--red)" }}>
        Something broke
      </span>
      <h1 className="h-disp" style={{ fontSize: 28, margin: "0 0 10px" }}>
        Not you — us.
      </h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: "0 0 24px" }}>
        The page hit an error. Your data is fine. Try again — if it keeps happening, sign out and
        back in.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
