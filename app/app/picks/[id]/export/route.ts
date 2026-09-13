import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { exportFilename, isPickId, viewableDetail } from "@/lib/picks/detail";
import { pickToText } from "@/lib/picks/format";

/** The pick as plain text, the same text "Copy all" puts on the clipboard. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!isPickId(id)) return new NextResponse("Not found", { status: 404 });
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) return new NextResponse("Not found", { status: 404 });
  const detail = viewableDetail(await repo.getPickDetail(id), business.id);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const scripts = [...detail.scripts].sort((a, b) => a.position - b.position);
  return new NextResponse(pickToText({ pick: detail.pick, scripts }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(detail.pick.term)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
