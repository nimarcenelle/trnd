/** Amber = opportunity. The score plus its plain-English breakdown. */
export default function ScoreBadge({ score, size = "lg" }: { score: number; size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        background: "var(--amber-soft)",
        border: "1px solid var(--amber)",
        borderRadius: big ? 14 : 10,
        padding: big ? "10px 16px" : "4px 10px",
      }}
    >
      <span className="score-num" style={{ fontSize: big ? 30 : 16, color: "var(--amber)" }}>
        {score.toFixed(1)}
      </span>
      <span className="mono-label" style={{ color: "var(--amber)" }}>
        / 10
      </span>
    </div>
  );
}
