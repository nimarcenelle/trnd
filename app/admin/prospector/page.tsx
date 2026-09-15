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
        <b>Legacy tool, outside the pilot funnel.</b> This prospector finds local businesses without an ad pixel, the customer TRND
        no longer sells to. Nothing schedules it: there is no cron, and an email leaves only when an operator clicks Send on queued
        leads. The pilot&apos;s front door is the application form on the home page.
      </p>
      <ProspectorClient />
    </>
  );
}
