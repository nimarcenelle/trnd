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
      title={store ? `See what ${store}'s competitors are running` : "Create your account"}
      sub="14 days free on every plan. Your first report is ready a few minutes after you start."
    >
      <AuthForm mode="signup" site={store || undefined} />
    </AuthShell>
  );
}
