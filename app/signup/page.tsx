import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Create account — TRND" };

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/app/picks");
  return (
    <AuthShell
      title="Create your account."
      sub="Two minutes of setup, then TRND starts reading your market."
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
