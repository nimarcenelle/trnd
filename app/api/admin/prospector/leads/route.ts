import { getAdminUser } from "@/lib/auth/admin";
import { isProspectorEnabled } from "@/lib/env";
import { listLeads } from "@/lib/prospect/store";

/** Admin-only: the saved leads table, newest first. */
export async function GET(): Promise<Response> {
  if (!isProspectorEnabled) {
    return Response.json({ error: "Not authorized." }, { status: 404 });
  }
  if (!(await getAdminUser())) {
    return Response.json({ error: "Not authorized." }, { status: 404 });
  }
  return Response.json({ leads: await listLeads() });
}
