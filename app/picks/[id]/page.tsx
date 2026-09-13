import { redirect } from "next/navigation";

/** The short link: /picks/[id] is the in-app pick page. */
export default async function PickShortLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/picks/${encodeURIComponent(id)}`);
}
