import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";

import { syncMetaAdHistory } from "@/lib/ads/history-sync";
import { exchangeCodeForToken, listAdAccounts, REQUIRED_SCOPE, verifyOauthState, whoAuthorized } from "@/lib/ads/meta";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

/**
 * OAuth callback: verify the signed state belongs to the signed-in owner's
 * business, exchange the code for a long-lived token, confirm the person
 * actually allowed the one permission the product needs, pick the first
 * active ad account, and store the connection. Errors land back in Settings
 * with a readable flag rather than a dead end.
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

  let notice: string | null = null;
  try {
    const { token, expiresAt } = await exchangeCodeForToken(code!);
    // A person can untick "read your ads" on the consent screen and still
    // land here with a token that cannot read anything. Say so now, not as
    // a silent empty sync tonight.
    const { userId, granted } = await whoAuthorized(token);
    if (!granted.includes(REQUIRED_SCOPE)) {
      notice = "TRND wasn't allowed to read your ads. Connect again and leave the ad results permission switched on.";
    } else {
      const accounts = await listAdAccounts(token);
      const account = accounts[0] ?? null;
      if (!account) {
        notice = "That Meta login has no active ad account. Sign in with the profile that manages your ads and connect again.";
      } else {
        await repo.upsertConnection({
          business_id: business.id,
          provider: "meta",
          status: "connected",
          account_id: account.id,
          account_name: account.name,
          provider_user_id: userId,
          access_token: token,
          refresh_token: null,
          token_expires_at: expiresAt,
          scopes: granted,
        });
        // The owner lands on Settings now; the account's ad history follows in
        // the background, so the first report after connecting already knows
        // what has worked for this brand. after() still runs past the redirect.
        after(() => syncMetaAdHistory(repo, business).then(() => undefined));
      }
    }
  } catch (err) {
    console.warn("[connect:meta] failed:", (err as Error).message);
    notice = "Connecting to Meta failed — check the app's permissions and try again.";
  }
  if (notice) fail(notice);
  redirect("/app/settings?connected=meta");
}
