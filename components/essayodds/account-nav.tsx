"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** "Log in" until the page knows someone is signed in, then a link to their essays. */
export default function AccountNav() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/account/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { email: string | null } | null) => setEmail(d?.email ?? null))
      .catch(() => {});
  }, []);
  return email ? (
    <Link href="/essay" className="btn btn-ghost btn-sm" title={email}>
      My essays
    </Link>
  ) : (
    <Link href="/login" className="btn btn-ghost btn-sm">
      Log in
    </Link>
  );
}
