import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { legacyPickIndex } from "@/lib/picks/list";
import { weekOf } from "@/lib/recommend/week";

/**
 * The week used to live here as a one-pick carousel paged by `?pick=n`. It
 * is the ranked list at /app/picks now, and every pick has its own address.
 * Sign-in, login and onboarding all still land on /app, so this stays as
 * the door. An old `?pick=n` link goes to that pick when this week has one.
 * The waiting states and background kicks that lived here moved to the list.
 */
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string | string[] }>;
}) {
  const { pick } = await searchParams;
  if (pick !== undefined) {
    const user = await getSessionUser();
    if (!user) redirect("/login");
    const repo = await getUserRepo(user.id);
    const business = await repo.getBusinessByOwner(user.id);
    if (!business) redirect("/onboarding");
    const rows = await repo.listReadyPicks(business.id, weekOf());
    const index = legacyPickIndex(pick, rows.length);
    if (index !== null) redirect(`/app/picks/${rows[index].pick.id}`);
  }
  redirect("/app/picks");
}
