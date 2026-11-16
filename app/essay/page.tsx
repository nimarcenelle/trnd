import { notFound } from "next/navigation";

import AppHeader from "@/components/essayodds/app-header";
import EssayWorkspace from "@/components/essayodds/essay-workspace";
import { paidAccess } from "@/lib/essayodds/access";
import { PROMPTS, wordLimit } from "@/lib/essayodds/prompts";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "Essays · EssayOdds" };

export default async function EssayPage({ searchParams }: PageProps<"/essay">) {
  if (!isEssayOpen) notFound();
  const access = await paidAccess();
  const session = access?.id ?? null;
  const { welcome, school, p } = await searchParams;
  const picked = typeof school === "string" ? PROMPTS[school]?.prompts[Number(p)] : undefined;
  const start = picked ? { prompt: picked.text, limit: wordLimit(picked) } : undefined;
  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader welcome={welcome === "1"} />
      <EssayWorkspace paid={Boolean(session)} start={start} />
    </div>
  );
}
