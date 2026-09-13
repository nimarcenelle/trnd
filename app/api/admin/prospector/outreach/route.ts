import { getAdminUser } from "@/lib/auth/admin";
import { isProspectorEnabled } from "@/lib/env";
import { sendOutreach } from "@/lib/prospect/outreach";
import { setLeadStatus } from "@/lib/prospect/store";

export const maxDuration = 120;

interface OutreachBody {
  action?: "queue" | "unqueue" | "opt_out" | "skip" | "send";
  placeIds?: string[];
  subject?: string;
  body?: string;
}

/**
 * Admin-only queue management and the actual send. Status flips are
 * idempotent; `send` mails at most 25 queued leads per call and reports
 * exactly what went out.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isProspectorEnabled) {
    return Response.json({ error: "Not authorized." }, { status: 404 });
  }
  if (!(await getAdminUser())) {
    return Response.json({ error: "Not authorized." }, { status: 404 });
  }
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Bad origin." }, { status: 403 });
  }

  let body: OutreachBody;
  try {
    body = (await req.json()) as OutreachBody;
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }
  const placeIds = (body.placeIds ?? []).map(String).filter(Boolean).slice(0, 200);
  if (placeIds.length === 0) {
    return Response.json({ error: "No leads given." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "queue":
        await setLeadStatus(placeIds, "queued");
        return Response.json({ ok: true });
      case "unqueue":
        await setLeadStatus(placeIds, "new");
        return Response.json({ ok: true });
      case "opt_out":
        await setLeadStatus(placeIds, "opted_out");
        return Response.json({ ok: true });
      case "skip":
        await setLeadStatus(placeIds, "skipped");
        return Response.json({ ok: true });
      case "send": {
        const subject = String(body.subject ?? "").trim();
        const template = String(body.body ?? "").trim();
        if (!subject || !template) {
          return Response.json({ error: "Subject and body are required." }, { status: 400 });
        }
        const result = await sendOutreach(placeIds, subject, template);
        return Response.json({ ok: true, ...result });
      }
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Outreach action failed." },
      { status: 500 },
    );
  }
}
