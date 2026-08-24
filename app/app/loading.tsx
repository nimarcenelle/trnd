export default function AppLoading() {
  return (
    <div className="wrap" style={{ padding: "44px 32px" }}>
      <div className="skeleton" style={{ height: 14, width: 220, marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: "var(--radius-card)", marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
        <div className="skeleton" style={{ height: 90 }} />
        <div className="skeleton" style={{ height: 90 }} />
        <div className="skeleton" style={{ height: 90 }} />
      </div>
    </div>
  );
}
