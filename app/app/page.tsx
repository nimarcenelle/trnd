export default function AppHome() {
  // Placeholder — the real "this week's recommendation" screen lands with the
  // scoring milestone.
  return (
    <div className="wrap" style={{ padding: "48px 32px" }}>
      <span className="eyebrow">This week</span>
      <h1 className="h-disp" style={{ fontSize: 28 }}>
        Your first recommendation is on its way.
      </h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: 480, lineHeight: 1.6 }}>
        TRND reads your market daily. The weekly recommendation lands here.
      </p>
    </div>
  );
}
