const SIGNALS: [string, string, boolean?][] = [
  ["↑34%", "Iced latte alternatives in search"],
  ["↑27%", "Same-day booking intent"],
  ["↑48%", "Recovery & wellness conversation"],
  ["Low", "Competitor ad saturation in your zip", true],
  ["↑22%", "Weekend brunch demand"],
  ["8.7/10", "This week's opportunity score"],
  ["2.1×", "This angle outperformed for businesses like yours", true],
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
