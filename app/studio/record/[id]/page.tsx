import { notFound } from "next/navigation";

import TeardownPlayer from "@/components/creator/player";
import { requireAdmin } from "@/lib/creator/admin";
import { getTeardown } from "@/lib/creator/store";

export const metadata = { title: "Record — TRND", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The teardown as a 9:16 video to screen-record. Outside the studio's chrome so nothing but the frame is on screen. */
export default async function RecordPage({ params }: PageProps<"/studio/record/[id]">) {
  await requireAdmin();
  const t = await getTeardown((await params).id);
  if (!t) notFound();
  return <TeardownPlayer t={{ id: t.id, handle: t.handle, platform: t.platform, stats: t.stats, script: t.script }} />;
}
