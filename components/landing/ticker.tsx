// Lines from a real founding analysis TRND wrote for a New York bike shop on
// its first day — not sample data. The landing page sells what the product
// actually says.
const SIGNALS: [string, string, boolean?][] = [
  ["Edge", "Your $50 delivery solves the fourth-floor walk-up nightmare — lead with it"],
  ["Watch-out", "Meta flags e-bike ads as motorized — say pedal-assist, never motor", true],
  ["When", "Buy attention in mid-February, when every rival goes dark and clicks are cheap"],
  ["Anchor", "The $15.55 flat fix is your loss leader the morning after a rainstorm"],
  ["Rivals", "5 nearest shops found and read daily — ads and ratings", true],
  ["Never", "Generic spring clearance for Trek and Giant drowns in dealer ads"],
  ["Who", "Internet buyers staring at a boxed Canyon they can't assemble"],
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
