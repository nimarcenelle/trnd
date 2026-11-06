import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Create account — TRND" };

/** Usually arrived at from the home page: the site typed there comes along in ?site=. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { site, for: audience, handle } = await searchParams;
  const creator = audience === "creator";
  const who = creator && typeof handle === "string" && /^[a-z0-9._]{2,30}$/i.test(handle) ? `@${handle}` : "";
  const store = typeof site === "string" ? site.trim().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "";
  const user = await getSessionUser();
  if (user) redirect(store ? `/app/setup?url=${encodeURIComponent(store)}` : "/app");
  return (
    <AuthShell
      title={creator ? (who ? `Watch ${who}'s niche every day` : "Watch your niche every day") : store ? `See what ${store}'s competitors are running` : "Create your account"}
      sub={creator ? "Free for 7 days. Pick the creators you compete with after you sign up." : "Free for 14 days. Your first report is ready a few minutes after you sign up."}
    >
      <AuthForm mode="signup" site={store || undefined} />
    </AuthShell>
  );
}
