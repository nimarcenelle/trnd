import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { exchangeCodeForToken, listAdAccounts, META_SCOPES, verifyOauthState } from "@/lib/ads/meta";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

/**
 * OAuth callback: verify the signed state belongs to the signed-in owner's
 * business, exchange the code for a long-lived token, pick the first active
 * ad account, and store the connection. Errors land back in Settings with a
 * readable flag rather than a dead end.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fail = (reason: string) => redirect(`/app/settings?connect_error=${encodeURIComponent(reason)}`);

  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  if (params.get("error")) fail(params.get("error_description") ?? "Meta denied the connection.");
  const businessId = verifyOauthState(params.get("state"));
  if (!businessId || businessId !== business.id) fail("The connect link was stale — try again.");
  const code = params.get("code");
  if (!code) fail("Meta returned no authorization code.");

  try {
    const { token, expiresAt } = await exchangeCodeForToken(code!);
    const accounts = await listAdAccounts(token);
    const account = accounts[0] ?? null;
    await repo.upsertConnection({
      business_id: business.id,
      provider: "meta",
      status: "connected",
      account_id: account?.id ?? null,
      account_name: account?.name ?? null,
      access_token: token,
      refresh_token: null,
      token_expires_at: expiresAt,
      scopes: META_SCOPES,
    });
  } catch (err) {
    console.warn("[connect:meta] failed:", (err as Error).message);
    fail("Connecting to Meta failed — check the app's permissions and try again.");
  }
  redirect("/app/settings?connected=meta");
}
