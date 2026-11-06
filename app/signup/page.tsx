import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/auth-shell";
import Passwordless from "@/components/auth/passwordless";
import { getSessionUser } from "@/lib/auth/session";
import { normHandle } from "@/lib/tiktok/read";

export const metadata = { title: "Create account — TRND for creators" };

/** Arrived at from a preview ("Unlock my plan") or the home page: the handle comes along in ?handle=. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { handle: raw, from, full } = await searchParams;
  const handle = typeof raw === "string" ? normHandle(raw).slice(0, 24) : "";
  const next = handle ? `/app/setup?handle=${encodeURIComponent(handle)}` : "/app/setup";
  const user = await getSessionUser();
  if (user) redirect(next);
  return (
    <AuthShell
      title={handle ? `Save @${handle}'s plan` : "Create your account"}
      sub={
        from === "preview"
          ? full === "visitor"
            ? `You've checked a lot of accounts today. Create a free account and we'll read ${handle ? `@${handle}` : "yours"} in a few minutes.`
            : `Today's free checks are used up. Create a free account and we'll read ${handle ? `@${handle}` : "yours"} in a few minutes.`
          : "See what's killing your posts. Free account, no card."
      }
    >
      <Passwordless mode="signup" next={next} />
    </AuthShell>
  );
}
