import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { conceptToDocx, conceptToMarkdown } from "@/lib/picks/concept-export";
import { buildConceptView, conceptExportFilename } from "@/lib/picks/concept-view";
import { exportFilename, isPickId, viewableDetail } from "@/lib/picks/detail";
import { pickToText } from "@/lib/picks/format";

/** The brief as a file: plain text (the same text "Copy all" puts on the
 * clipboard), Markdown for Notion and Slack, or Word for the agency. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!isPickId(id)) return new NextResponse("Not found", { status: 404 });
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) return new NextResponse("Not found", { status: 404 });
  const detail = viewableDetail(await repo.getPickDetail(id), business.id);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const format = request.nextUrl.searchParams.get("format") ?? "txt";
  // A creative test exports as the brief a creator gets; an older keyword
  // pick exports as it always did.
  const concept = buildConceptView(detail);
  if (concept && format === "md") {
    return file(conceptToMarkdown(concept), conceptExportFilename(concept.title).replace(/\.txt$/, ".md"), "text/markdown; charset=utf-8");
  }
  if (concept && format === "docx") {
    const bytes = await conceptToDocx(concept);
    return file(bytes, conceptExportFilename(concept.title).replace(/\.txt$/, ".docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }
  const scripts = [...detail.scripts].sort((a, b) => a.position - b.position);
  const body = concept ? concept.copyAll : pickToText({ pick: detail.pick, scripts });
  const filename = concept ? conceptExportFilename(concept.title) : exportFilename(detail.pick.term);
  return file(body, filename, "text/plain; charset=utf-8");
}

function file(body: string | Buffer, filename: string, type: string): NextResponse {
  return new NextResponse(body as BodyInit, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
