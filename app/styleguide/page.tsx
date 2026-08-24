import ThemeToggle from "@/components/theme-toggle";

export const metadata = { title: "TRND — Styleguide" };

const TOKENS = [
  "bg",
  "bg-1",
  "bg-2",
  "paper",
  "card-stroke",
  "ink",
  "ink-soft",
  "ink-faint",
  "line",
  "line-strong",
  "amber",
  "amber-ink",
  "amber-hover",
  "mint",
  "mint-ink",
  "red",
];

export default function Styleguide() {
  return (
    <main className="wrap" style={{ padding: "48px 32px 96px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">Design system</span>
        <ThemeToggle />
      </div>
      <h1 className="h-disp" style={{ fontSize: "clamp(26px,3.4vw,38px)", margin: "0 0 8px" }}>
        Every token, in both themes.
      </h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: 560, lineHeight: 1.6 }}>
        Use the toggle to flip themes. Amber means opportunity — the thing to do now. Mint means
        measured reality. Ink-faint means the old way.
      </p>

      <h2 className="mono-label" style={{ margin: "40px 0 14px" }}>
        Color tokens
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {TOKENS.map((t) => (
          <div key={t} className="card" style={{ padding: 10 }}>
            <div
              style={{
                height: 44,
                borderRadius: 6,
                background: `var(--${t})`,
                border: "1px solid var(--line)",
              }}
            />
            <div className="mono-label" style={{ marginTop: 8 }}>
              --{t}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mono-label" style={{ margin: "40px 0 14px" }}>
        Type
      </h2>
      <div className="card-lg" style={{ padding: 28 }}>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 34, letterSpacing: "-0.02em" }}>
          Bricolage Grotesque — display
        </div>
        <div style={{ fontFamily: "var(--body)", fontSize: 16, marginTop: 10, color: "var(--ink-soft)" }}>
          Inter — body copy. Know what&apos;s moving before you spend a dollar.
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, marginTop: 10, letterSpacing: "0.05em" }}>
          IBM PLEX MONO — LABELS, METRICS, TICKERS · ↑34% · 8.7 / 10
        </div>
      </div>

      <h2 className="mono-label" style={{ margin: "40px 0 14px" }}>
        Buttons
      </h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary">Build the campaign</button>
        <button className="btn btn-ghost">See how it works</button>
        <button className="btn btn-primary btn-sm">Request a demo</button>
        <button className="btn btn-primary" disabled>
          Disabled
        </button>
      </div>

      <h2 className="mono-label" style={{ margin: "40px 0 14px" }}>
        Pills &amp; eyebrows
      </h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span className="pill">No agency retainer</span>
        <span className="pill">New campaign every week</span>
        <span className="eyebrow" style={{ margin: 0 }}>
          Live signal → finished campaign
        </span>
        <span className="eyebrow eyebrow--mint" style={{ margin: 0 }}>
          Measured result
        </span>
      </div>

      <h2 className="mono-label" style={{ margin: "40px 0 14px" }}>
        Cards
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--mint)", fontWeight: 600 }}>
            ↑34% search interest
          </div>
          <div style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5, margin: "6px 0 4px" }}>
            Iced latte alternatives
          </div>
          <div className="mono-label">COFFEE SHOPS &amp; CAFÉS</div>
        </div>
        <div className="card-lg" style={{ padding: 20, borderColor: "var(--amber)", background: "linear-gradient(180deg, var(--amber-soft), transparent)" }}>
          <span className="mono-label" style={{ color: "var(--amber)" }}>
            ● this week
          </span>
          <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18, marginTop: 8 }}>
            The recommendation card
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>
            Amber border marks the one primary thing to act on.
          </div>
        </div>
      </div>

      <h2 className="mono-label" style={{ margin: "40px 0 14px" }}>
        Form fields
      </h2>
      <div className="card-lg" style={{ padding: 28, maxWidth: 560 }}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="sg-name">Full name</label>
            <input id="sg-name" type="text" placeholder="Jordan Lee" />
          </div>
          <div className="field">
            <label htmlFor="sg-cat">Category</label>
            <select id="sg-cat" defaultValue="">
              <option value="">Select one</option>
              <option>Restaurants &amp; cafés</option>
            </select>
          </div>
        </div>
        <p className="form-error">Fill in your name first.</p>
        <div className="skeleton" style={{ height: 44 }} />
      </div>
    </main>
  );
}
