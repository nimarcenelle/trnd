import { analysisRunningSlow, type OnboardingFinding } from "@/lib/onboarding/findings";

/**
 * The founding-analysis wait, told in findings rather than stages.
 *
 * This used to be a checklist that advanced on wall-clock time — honest
 * about duration, but it taught the owner nothing while they watched it.
 * Every row here is read from what the pipeline has actually written
 * (lib/onboarding/findings.ts), so a completed row is a fact about their
 * business, in their own numbers, and the page can't claim a step that
 * didn't happen. The dashboard's own refresh advances it.
 */

export default function AnalysisProgress({
  findings,
  startedAt,
}: {
  findings: OnboardingFinding[];
  startedAt: string;
}) {
  const currentIndex = findings.findIndex((f) => !f.done);
  // Say so when the work has stalled rather than leaving a dot pulsing at someone.
  const slow = analysisRunningSlow(startedAt);

  return (
    <div className="an-progress" role="status" aria-live="polite">
      {findings.map((finding, i) => {
        const current = i === currentIndex;
        return (
          <div
            key={finding.key}
            className={`an-progress__row${finding.done ? " is-done" : current ? " is-current" : ""}`}
          >
            <span className="an-progress__mark" aria-hidden="true" />
            <div>
              <p className="an-progress__head">{finding.done ? finding.headline : finding.pending}</p>
              {finding.done && finding.detail && (
                <p className="an-progress__detail">{finding.detail}</p>
              )}
            </div>
          </div>
        );
      })}
      {slow && currentIndex !== -1 && (
        <p className="an-progress__slow">Taking longer than usual — hang tight, TRND retries on its own.</p>
      )}
    </div>
  );
}
