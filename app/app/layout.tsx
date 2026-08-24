import "./app.css";

import { redirect } from "next/navigation";

import AppNav from "@/components/app/app-nav";
import { signOutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/env";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppNav businessName={business.name} signOut={signOutAction} />
      {!isSupabaseConfigured && (
        <div
          style={{
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--line)",
            padding: "7px 24px",
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            letterSpacing: "0.05em",
            color: "var(--ink-faint)",
          }}
        >
          DEMO MODE — LOCAL STORE, ILLUSTRATIVE DATA. SEE BLOCKED.MD TO CONNECT SUPABASE.
        </div>
      )}
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
