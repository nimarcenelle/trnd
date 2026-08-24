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
        <div className="demo-strip">
          <b>Demo mode</b> local store · illustrative data · see BLOCKED.md to connect Supabase
        </div>
      )}
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
