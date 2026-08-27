import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { metaOauthUrl } from "@/lib/ads/meta";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isMetaAdsConfigured } from "@/lib/env";

/** Start the Meta ad-account OAuth dance for the signed-in owner. */
export async function GET() {
  if (!isMetaAdsConfigured) {
    return NextResponse.json(
      { error: "Meta app credentials are not configured (META_APP_ID / META_APP_SECRET)." },
      { status: 501 },
    );
  }
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  redirect(metaOauthUrl(business.id));
}
