import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { isPilotGated } from "@/lib/env";

export const metadata = { title: "Create account — TRND" };

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/app/picks");
  return (
    <AuthShell
      title="Create your account."
      sub={
        isPilotGated
          ? "TRND is in a founder-assisted pilot. Accepted brands get an invite code by email; everyone else can apply from the home page."
          : "Two minutes of setup, then TRND reads your customers, your competitors and your catalog and writes the first briefs."
      }
    >
      <AuthForm mode="signup" invite={isPilotGated} />
    </AuthShell>
  );
}
