import { gradeFor } from "@/lib/recommend/grade";

/**
 * The verdict: one letter, one phrase, five stars.
 *
 * The stars are the ONLY rating on the screen. Sub-ratings per component
 * used to sit under this, which did two bad things at once — it published
 * the shape of the model to anyone reading, and it asked an owner to
 * reconcile five numbers into a decision that the one number already made.
 * The context that earns the grade lives in the briefing rail instead,
 * where it reads as reasons rather than as arithmetic.
 */
function Stars({ pct }: { pct: number }) {
  // Half-star resolution: ten half-steps across five stars.
  const halves = Math.round(Math.min(Math.max(pct, 0), 1) * 10);
  return (
    <div className="stars" role="img" aria-label={`${(halves / 2).toFixed(1)} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(Math.max(halves - i * 2, 0), 2); // 0, 1, 2
        return (
          <span key={i} className={`stars__s stars__s--${fill}`} aria-hidden="true">
            ★
          </span>
        );
      })}
    </div>
  );
}

export default function GradeCard({ score }: { score: number }) {
  const g = gradeFor(score);
  return (
    <section className={`gradecard gradecard--${g.tone}`} aria-label="Opportunity grade">
      <p className="gradecard__eyebrow">Opportunity grade</p>
      <div className="gradecard__row">
        <span className="gradecard__letter">{g.letter}</span>
        <span className="gradecard__label">{g.label.toLowerCase()}</span>
      </div>
      <Stars pct={g.pct} />
      <p className="gradecard__sub">{g.sub}</p>
    </section>
  );
}
