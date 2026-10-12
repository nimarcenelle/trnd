import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Create account — TRND" };

/** Usually arrived at from the home page: the site typed there comes along in ?site=. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { site } = await searchParams;
  const store = typeof site === "string" ? site.trim().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "";
  const user = await getSessionUser();
  if (user) redirect(store ? `/app/setup?url=${encodeURIComponent(store)}` : "/app");
  return (
    <AuthShell
      title={store ? `Point the cameras at ${store}'s rivals.` : "Create your account."}
      sub="TRND finds your competitors, reads every Meta ad they run, and tells you what's working, then watches for changes every day."
    >
      <AuthForm mode="signup" site={store || undefined} />
    </AuthShell>
  );
}
