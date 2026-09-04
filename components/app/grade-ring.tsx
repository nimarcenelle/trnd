import { gradeFor } from "@/lib/recommend/grade";

const C = 2 * Math.PI * 52;

/** The headline verdict: a letter grade on a filled ring — just the letter;
 * the breakdown meters below it carry the numbers. */
export default function GradeRing({ score }: { score: number }) {
  const g = gradeFor(score);
  return (
    <div className={`grade-ring grade-ring--${g.tone}`}>
      <div className="grade-ring__wrap">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg-2)" strokeWidth="9" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="var(--grade-stroke, var(--amber))"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - g.pct)}
          />
        </svg>
        <div className="grade-ring__num">
          <span className="n">{g.letter}</span>
          <span className="d">grade</span>
        </div>
      </div>
      <div className="grade-ring__label">{g.label}</div>
      <div className="grade-ring__sub">{g.sub}</div>
    </div>
  );
}