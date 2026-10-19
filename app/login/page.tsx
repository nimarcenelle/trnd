import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import Passwordless from "@/components/auth/passwordless";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Sign in — TRND for creators" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getSessionUser();
  if (user) redirect("/app");
  const { error } = await searchParams;
  return (
    <AuthShell title="Welcome back" sub="Sign in to see what to post next.">
      {error === "auth" && <p className="form-error mt-0">That sign-in didn&apos;t work or has expired. Try again below.</p>}
      <Passwordless mode="login" next="/app" />
      <details className="mt-5 border-t border-line pt-4">
        <summary className="caption text-center hover:text-ink">Sign in with a password instead</summary>
        <div className="mt-4">
          <AuthForm mode="login" />
        </div>
      </details>
    </AuthShell>
  );
}
