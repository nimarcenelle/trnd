const SIGNALS: [string, string, boolean?][] = [
  ["↑34%", "ICED LATTE ALTERNATIVES — SEARCH"],
  ["↑27%", "SAME-DAY BOOKING INTENT"],
  ["↑48%", "RECOVERY & WELLNESS CONVERSATION"],
  ["LOW", "COMPETITOR AD SATURATION — YOUR ZIP", true],
  ["↑22%", "WEEKEND BRUNCH DEMAND"],
  ["8.7/10", "OPPORTUNITY SCORE — THIS WEEK"],
  ["2.1×", "THIS ANGLE OUTPERFORMED FOR SIMILAR BUSINESSES", true],
];

export default function Ticker() {
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker__track">
        {[0, 1].map((r) =>
          SIGNALS.map(([v, l, hot], i) => (
            <span className="ticker__item" key={`${r}-${i}`}>
              <b className={hot ? "hot" : undefined}>{v}</b>
              {l}
            </span>
          )),
        )}
      </div>
    </div>
  );
}
