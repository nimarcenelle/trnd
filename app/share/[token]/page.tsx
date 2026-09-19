import "@/app/app/app.css";
import "@/app/app/picks/[id]/pick-record.css";

import { notFound } from "next/navigation";

import SharedBrief from "@/components/picks/shared-brief";
import { getAdminRepo } from "@/lib/db/admin";
import { buildConceptView } from "@/lib/picks/concept-view";

export const metadata = { title: "Brief — TRND", robots: { index: false, follow: false } };

/**
 * A brief by its share token, without an account. The token is the only
 * key: unguessable, retired the moment the owner stops sharing. The page
 * carries the brief and the brand's name and nothing else.
 */
export default async function SharedBriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const found = await getAdminRepo()
    .getPickDetailByShareToken(token)
    .catch(() => null);
  if (!found) notFound();
  const view = buildConceptView(found.detail);
  if (!view) notFound();
  return (
    <main className="min-h-dvh">
      <SharedBrief view={view} brand={found.business.name} />
    </main>
  );
}
