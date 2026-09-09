import { getAdminUser } from "@/lib/auth/admin";
import { listLeads } from "@/lib/prospect/store";

/** Admin-only: the saved leads table, newest first. */
export async function GET(): Promise<Response> {
  if (!(await getAdminUser())) {
    return Response.json({ error: "Not authorized." }, { status: 404 });
  }
  return Response.json({ leads: await listLeads() });
}
