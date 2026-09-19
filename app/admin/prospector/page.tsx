import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAdminUser } from "@/lib/auth/admin";

import { ProspectorClient } from "./prospector-client";

export const metadata: Metadata = {
  title: "TRND / prospector",
  robots: { index: false, follow: false },
};

/** Internal growth tool — invisible (404) to anyone but admins. */
export default async function ProspectorPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return (
    <>
      <p
        role="note"
        style={{
          margin: "16px auto 0",
          maxWidth: 1100,
          padding: "10px 14px",
          border: "1px solid var(--amber)",
          borderRadius: 8,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: "var(--ink-soft)",
          background: "var(--amber-softer)",
        }}
      >
<b>Internal.</b> The free account read at the top reads a DTC prospect&apos;s brand the way a signup is read and writes the
        teardown email: the demo, the pitch and the lead magnet in one. The local-business prospector under it is the older tool;
        nothing schedules either, and an email leaves only when you send it. The pilot&apos;s front door is the application form
        on the home page.
      </p>
      <ProspectorClient />
    </>
  );
}
