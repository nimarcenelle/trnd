"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const id = String(formData.get("id") ?? "");
  try {
    if (id) await repo.deleteDocument(id);
  } catch (err) {
    console.warn("[documents] delete failed (non-fatal):", (err as Error).message);
  }
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

/** Put the priced items a document listed onto the menu — the ones that
 * aren't there yet. The menu is the contract every campaign is written
 * against, so this is the upload that changes the copy the most. */
export async function adoptDocumentServicesAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const id = String(formData.get("id") ?? "");
  const doc = (await repo.listDocuments(business.id)).find((d) => d.id === id);
  if (!doc) return;
  const have = new Set((await repo.listServices(business.id)).map((s) => s.name.trim().toLowerCase()));
  const add = doc.digest.services_found.filter((s) => !have.has(s.name.trim().toLowerCase())).slice(0, 40);
  if (add.length > 0) {
    await repo.createServices(
      add.map((s) => ({
        business_id: business.id,
        name: s.name.trim(),
        description: null,
        price_cents: s.price_cents,
        is_active: true,
      })),
    );
  }
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}
