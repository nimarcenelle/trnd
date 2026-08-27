import { gradeFor } from "@/lib/recommend/grade";

export default function GradePill({ score, lead }: { score: number; lead?: boolean }) {
  const g = gradeFor(score);
  return (
    <span
      className={`grade-pill grade-pill--${g.tone}${lead ? " grade-pill--lead" : ""}`}
      title={g.label}
    >
      {g.letter}
    </span>
  );
}