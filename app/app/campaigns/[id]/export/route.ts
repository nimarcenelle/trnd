import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { NATIONWIDE_RADIUS } from "@/lib/signals/geo";
/**
 * Campaign export: ?format=json (full payload) or ?format=csv (Meta-ready
 * creative sheet). Downloading flips a draft to `exported`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const repo = await getUserRepo(user.id);
  const campaign = await repo.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const creatives = await repo.listCreatives(id);

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (campaign.status === "draft") {
    await repo.setCampaignStatus(id, "exported");
  }

  if (format === "csv") {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const headlines = creatives.filter((c) => c.kind === "headline");
    const primaries = creatives.filter((c) => c.kind === "primary_text");
    const rows: string[] = [
      "Campaign Name,Ad Set Name,Ad Name,Headline,Primary Text,Call To Action,Audience,Radius (miles)",
    ];
    let i = 0;
    for (const h of headlines) {
      const p = primaries[i % primaries.length];
      i += 1;
      rows.push(
        [
          esc(`TRND — ${campaign.hook}`),
          esc(`${campaign.audience.who} · ${campaign.audience.age_range}`),
          esc(`Variant ${i}`),
          esc(h.content),
          esc(p?.content ?? ""),
          esc(campaign.offer),
          esc(campaign.audience.interests.join("; ")),
          campaign.audience.radius_miles >= NATIONWIDE_RADIUS ? "US" : String(campaign.audience.radius_miles),
        ].join(","),
      );
    }
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trnd-campaign-${id.slice(0, 8)}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify({ campaign, creatives }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="trnd-campaign-${id.slice(0, 8)}.json"`,
    },
  });
}
