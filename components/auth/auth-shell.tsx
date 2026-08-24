import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

export default function AuthShell({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Brand />
        <ThemeToggle />
      </nav>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 20px",
        }}
      >
        <div className="card-lg" style={{ width: "100%", maxWidth: 420, padding: "40px 34px" }}>
          <h1 className="h-disp" style={{ fontSize: 24, margin: "0 0 8px" }}>
            {title}
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--ink-soft)", margin: "0 0 26px", lineHeight: 1.55 }}>
            {sub}
          </p>
          {children}
        </div>
      </div>
    </main>
  );
}
