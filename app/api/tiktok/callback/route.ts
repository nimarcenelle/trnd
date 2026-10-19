import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getCreator } from "@/lib/data";
import { completeConnect, disconnect } from "@/lib/tiktok/connect";
import { normHandle } from "@/lib/tiktok/read";

/** TikTok sends the creator back here with a code; a different account than the one they track is refused. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("tt_state")?.value;
  jar.delete({ name: "tt_state", path: "/api/tiktok" });
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) redirect("/app/settings?tiktok=denied#tiktok");
  let username = "";
  try {
    username = await completeConnect(creator.id, code);
  } catch (err) {
    console.warn("[tiktok] connect:", (err as Error).message);
    redirect("/app/settings?tiktok=failed#tiktok");
  }
  if (normHandle(username) !== creator.handle) {
    await disconnect(creator.id);
    redirect(`/app/settings?tiktok=mismatch&as=${encodeURIComponent(username)}#tiktok`);
  }
  redirect("/app/settings?tiktok=connected#tiktok");
}
