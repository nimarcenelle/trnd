import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { digestUpload } from "@/lib/documents/digest";
import { MAX_BYTES, MAX_DOCUMENTS, mimeFor } from "@/lib/documents/parse";

export const maxDuration = 120;

/**
 * Upload one document, or paste text as one. The raw bytes are read once,
 * digested, and dropped — only the extracted text and the digest are kept.
 * A route handler rather than a server action so an 8 MB menu PDF clears
 * the default action body limit.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Bad origin." }, { status: 403 });
  }
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) return Response.json({ error: "Set up your business first." }, { status: 400 });
  if ((await repo.listDocuments(business.id)).length >= MAX_DOCUMENTS) {
    return Response.json({ error: `You can keep up to ${MAX_DOCUMENTS} documents — remove one first.` }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Nothing was uploaded." }, { status: 400 });
  }

  let name: string;
  let mime: string;
  let bytes: Uint8Array;
  const file = form.get("file");
  const pasted = String(form.get("text") ?? "").trim();
  if (file instanceof File && file.size > 0) {
    name = file.name.slice(0, 120);
    const m = mimeFor(name);
    if (!m) return Response.json({ error: "PDF, CSV, TXT, MD or JSON — other formats aren't read yet." }, { status: 415 });
    if (file.size > MAX_BYTES) return Response.json({ error: "Files up to 8 MB." }, { status: 413 });
    mime = m;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (pasted.length >= 20) {
    name = String(form.get("name") ?? "").trim().slice(0, 120) || "Pasted notes";
    mime = "text/plain";
    bytes = new TextEncoder().encode(pasted.slice(0, 200_000));
  } else {
    return Response.json({ error: "Choose a file, or paste at least a few lines." }, { status: 400 });
  }

  const { text, digest, model_used } = await digestUpload(business, { name, mime, bytes });
  const doc = await repo.createDocument({
    business_id: business.id,
    name,
    mime,
    bytes: bytes.byteLength,
    text,
    digest,
    model_used,
  });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return Response.json({ id: doc.id, kind: digest.kind, facts: digest.facts.length, services: digest.services_found.length });
}
