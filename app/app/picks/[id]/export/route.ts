import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { buildConceptView, conceptExportFilename } from "@/lib/picks/concept-view";
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

  // A creative test exports as the brief a creator gets; an older keyword
  // pick exports as it always did.
  const concept = buildConceptView(detail);
  const scripts = [...detail.scripts].sort((a, b) => a.position - b.position);
  const body = concept ? concept.copyAll : pickToText({ pick: detail.pick, scripts });
  const filename = concept ? conceptExportFilename(concept.title) : exportFilename(detail.pick.term);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
