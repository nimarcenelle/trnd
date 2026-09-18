import { NextResponse, type NextRequest } from "next/server";

import { deauthorizeMetaUser, parseSignedRequest } from "@/lib/ads/meta-callbacks";
import { getAdminRepo } from "@/lib/db/admin";
import { isMetaAdsConfigured } from "@/lib/env";

/**
 * Meta's Deauthorize Callback: a person removed TRND from their Facebook
 * settings. The connection is marked revoked so Settings says so and the
 * daily sync stops. Meta signs the request with the app secret; anything
 * else is refused. No session: the caller is Meta, not the owner.
 */
export async function POST(request: NextRequest) {
  if (!isMetaAdsConfigured) return NextResponse.json({ error: "Meta app not configured" }, { status: 501 });
  const form = await request.formData().catch(() => null);
  const signed = parseSignedRequest(form?.get("signed_request")?.toString());
  if (!signed) return NextResponse.json({ error: "bad signed_request" }, { status: 400 });
  const result = await deauthorizeMetaUser(getAdminRepo(), signed.user_id);
  return NextResponse.json({ ok: true, ...result });
}
