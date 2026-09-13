import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/auth-shell";
import ForgotForm from "@/components/auth/forgot-form";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Reset password — TRND" };

export default async function ForgotPage() {
  const user = await getSessionUser();
  if (user) redirect("/app/picks");
  return (
    <AuthShell
      title="Reset your password."
      sub="Enter the email on your account and we'll send a link that lets you set a new one."
    >
      <ForgotForm />
    </AuthShell>
  );
}
