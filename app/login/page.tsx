import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Sign in — TRND" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getSessionUser();
  if (user) redirect("/app");
  const { error } = await searchParams;
  return (
    <AuthShell title="Welcome back." sub="Sign in to see this week's recommendation.">
      {error === "auth" && (
        <p className="form-error" style={{ marginTop: 0 }}>
          That sign-in link didn&apos;t work or has expired — try again below.
        </p>
      )}
      <AuthForm mode="login" />
    </AuthShell>
  );
}
