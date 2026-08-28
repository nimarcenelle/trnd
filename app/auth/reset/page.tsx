import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/auth-shell";
import ResetForm from "@/components/auth/reset-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Set a new password — TRND" };

/** Where the Supabase recovery link lands (already signed in by the code
 * exchange in /auth/callback). */
export default async function ResetPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect("/forgot");
  return (
    <AuthShell title="Set a new password." sub={`Signed in as ${user.email} via your recovery link.`}>
      <ResetForm />
    </AuthShell>
  );
}
