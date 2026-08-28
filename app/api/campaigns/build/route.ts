import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { buildCampaignForOpportunity } from "@/lib/campaigns/build";
import { getUserRepo } from "@/lib/db";

export type BuildEvent =
  | { type: "status"; label: string }
  | { type: "done"; campaignId: string }
  | { type: "error"; reason: string };

/**
 * "Build the campaign", streamed: one NDJSON line per generation stage so
 * the minute of model work reads as progress. Ends with the campaign id the
 * client navigates to.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return line({ type: "error", reason: "Not signed in." }, 401);

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return line({ type: "error", reason: "Bad origin." }, 403);
  }

  let opportunityId = "";
  try {
    opportunityId = String(((await req.json()) as { opportunity_id?: string }).opportunity_id ?? "");
  } catch {
    /* falls through to the missing-id error */
  }
  if (!opportunityId) return line({ type: "error", reason: "Missing opportunity." }, 400);

  const repo = await getUserRepo(user.id);

  // Plan gate: an ended trial (with billing live) stops NEW builds only —
  // existing campaigns stay readable and exportable.
  const business = await repo.getBusinessByOwner(user.id);
  if (business) {
    const { getPlanState } = await import("@/lib/billing");
    const plan = await getPlanState(repo, business);
    if (plan.locked) {
      return line({ type: "error", reason: `${plan.lockedReason} Upgrade in Settings → Billing.` }, 402);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BuildEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await buildCampaignForOpportunity(repo, opportunityId, (label) =>
          send({ type: "status", label }),
        );
        if ("error" in result) {
          send({ type: "error", reason: result.error });
        } else {
          revalidatePath("/app");
          revalidatePath("/app/opportunities");
          revalidatePath("/app/campaigns");
          send({ type: "done", campaignId: result.campaignId });
        }
      } catch (err) {
        console.warn("[campaigns] build failed:", (err as Error).message);
        send({ type: "error", reason: "The build hit a snag — try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

function line(event: BuildEvent, status: number): Response {
  return new Response(`${JSON.stringify(event)}\n`, {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}