import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAdminUser } from "@/lib/auth/admin";
import { isProspectorEnabled } from "@/lib/env";

import { ProspectorClient } from "./prospector-client";

export const metadata: Metadata = {
  title: "TRND / prospector",
  robots: { index: false, follow: false },
};

/** Internal growth tool — invisible (404) unless the cold-email flag is on
 * and the viewer is an admin. */
export default async function ProspectorPage() {
  if (!isProspectorEnabled) notFound();
  const admin = await getAdminUser();
  if (!admin) notFound();
  return <ProspectorClient />;
}
