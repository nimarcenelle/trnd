import { unsubscribeTokenOk } from "@/lib/auth/unsubscribe";
import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

/**
 * Turns the weekly plan email off. Posted by a mail app's one-click unsubscribe
 * (RFC 8058) or by the button on /unsubscribe. POST only: a link scanner's GET
 * changes nothing.
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const creatorId = url.searchParams.get("c") ?? "";
  if (!unsubscribeTokenOk(creatorId, url.searchParams.get("t"))) return new Response("invalid link", { status: 400 });
  const { error } = await adminSupabase().from("creators").update({ email_plans: false }).eq("id", creatorId);
  if (error) return new Response("try again", { status: 500 });
  // The page's own button gets the confirmation page; a mail app gets a plain 200.
  if (url.searchParams.get("from") === "page") return Response.redirect(`${env.siteUrl}/unsubscribe?done=1`, 303);
  return new Response("unsubscribed");
}
