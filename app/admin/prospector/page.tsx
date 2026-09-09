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
  return <ProspectorClient />;
}
