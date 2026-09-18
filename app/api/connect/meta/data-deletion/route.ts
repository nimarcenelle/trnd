import { NextResponse, type NextRequest } from "next/server";

import { deleteMetaUserData, parseSignedRequest, verifyDeletionConfirmation } from "@/lib/ads/meta-callbacks";
import { getAdminRepo } from "@/lib/db/admin";
import { env, isMetaAdsConfigured } from "@/lib/env";

/**
 * Meta's Data Deletion Request Callback. POST: a person asked Meta to have
 * their data deleted from TRND; the connection and every row it synced go,
 * and Meta gets the confirmation code and status URL it requires. GET: that
 * status URL, a plain page a person can read. Both are public: the caller
 * is Meta or the person, neither signed in.
 */
export async function POST(request: NextRequest) {
  if (!isMetaAdsConfigured) return NextResponse.json({ error: "Meta app not configured" }, { status: 501 });
  const form = await request.formData().catch(() => null);
  const signed = parseSignedRequest(form?.get("signed_request")?.toString());
  if (!signed) return NextResponse.json({ error: "bad signed_request" }, { status: 400 });
  const result = await deleteMetaUserData(getAdminRepo(), signed.user_id);
  return NextResponse.json({ url: result.statusUrl, confirmation_code: result.confirmationCode });
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — TRND</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;color:#1b1b1b}h1{font-size:22px}code{font:13px ui-monospace,monospace;word-break:break-all}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const confirmation = verifyDeletionConfirmation(code);
  if (!confirmation) {
    return page(
      "Deletion request not found",
      `<p>That confirmation code is not one TRND issued. If you removed TRND from your Facebook settings and want to check on the deletion, send the code Meta showed you through the <a href="${escapeHtml(env.appUrl)}/#demo">contact form</a>.</p>`,
      404,
    );
  }
  const when = confirmation.deletedAt.toUTCString();
  return page(
    "Deletion complete",
    `<p>The Meta connection behind this request, and every ad result TRND had synced from it, was deleted on <strong>${escapeHtml(when)}</strong>. Nothing further is pending.</p><p>Confirmation code: <code>${escapeHtml(code!)}</code></p>`,
  );
}
