import { redirect } from "next/navigation";

import AuthForm from "@/components/auth/auth-form";
import AuthShell from "@/components/auth/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { normHandle } from "@/lib/tiktok/read";

export const metadata = { title: "Create account — TRND for creators" };

/** Usually arrived at from the home page: the handle typed there comes along in ?handle=. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { handle: raw } = await searchParams;
  const handle = typeof raw === "string" ? normHandle(raw).slice(0, 24) : "";
  const user = await getSessionUser();
  if (user) redirect(handle ? `/app/setup?handle=${encodeURIComponent(handle)}` : "/app");
  return (
    <AuthShell title={handle ? `Let's plan @${handle}'s next posts` : "Create your account"} sub="Free for 14 days. Your first plan is ready a few minutes after you sign up.">
      <AuthForm mode="signup" handle={handle || undefined} />
    </AuthShell>
  );
}
