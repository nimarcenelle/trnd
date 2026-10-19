import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/auth-shell";
import Passwordless from "@/components/auth/passwordless";
import { getSessionUser } from "@/lib/auth/session";
import { normHandle } from "@/lib/tiktok/read";

export const metadata = { title: "Create account — TRND for creators" };

/** Arrived at from a preview ("Unlock my plan") or the home page: the handle comes along in ?handle=. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { handle: raw, from } = await searchParams;
  const handle = typeof raw === "string" ? normHandle(raw).slice(0, 24) : "";
  const next = handle ? `/app/setup?handle=${encodeURIComponent(handle)}` : "/app/setup";
  const user = await getSessionUser();
  if (user) redirect(next);
  return (
    <AuthShell
      title={handle ? `Save @${handle}'s plan` : "Create your account"}
      sub={
        from === "preview"
          ? "Free previews are busy right now. Create a free account and we'll build your full plan in a few minutes."
          : "Get all three scripts now, and a new plan every week. Free for 14 days."
      }
    >
      <Passwordless mode="signup" next={next} />
    </AuthShell>
  );
}
