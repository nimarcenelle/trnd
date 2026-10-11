import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { isPilotGated } from "@/lib/env";

export const metadata = { title: "Create account — TRND" };

/**
 * Signup, usually arrived at from the free read: the store's address comes
 * along in ?site= and onboarding starts from it without asking again.
 */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const user = await getSessionUser();
  if (user) redirect("/app/rivals");
  const { site } = await searchParams;
  const store = typeof site === "string" ? site.trim().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "";
  return (
    <AuthShell
      title={store ? `Keep the cameras on ${store}.` : "Create your account."}
      sub={
        isPilotGated
          ? "TRND is in a founder-assisted pilot. Accepted brands get an invite code by email; everyone else can apply from the home page."
          : store
            ? "Create your account and the cameras switch on: your competitors read every morning, the gap, and the test that fills it."
            : "Two minutes of setup, then TRND names your competitors and reads every ad they run, daily."
      }
    >
      <AuthForm mode="signup" invite={isPilotGated} site={store || undefined} />
    </AuthShell>
  );
}
