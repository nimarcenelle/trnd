import { getSessionUser } from "@/lib/auth/session";
import type { Business } from "@/lib/db/types";
import { digestUpload } from "@/lib/documents/digest";
import { MAX_BYTES, mimeFor } from "@/lib/documents/parse";
import { MAX_ONBOARDING_DOC_TEXT, type OnboardingDocument } from "@/lib/onboarding/menu-doc";

export const maxDuration = 120;

/**
 * Read a menu or price list during onboarding — before the business row
 * exists, so nothing is stored here. The digest comes back to the wizard,
 * which fills the "what you sell" rows from it and carries the document to
 * the finish step, where it becomes the business's first document.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Bad origin." }, { status: 403 });
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
    if (!m) return Response.json({ error: "PDF, Word, Excel, CSV, TXT, MD or JSON." }, { status: 415 });
    if (file.size > MAX_BYTES) return Response.json({ error: "Files up to 8 MB." }, { status: 413 });
    mime = m;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (pasted.length >= 20) {
    name = "Pasted menu";
    mime = "text/plain";
    bytes = new TextEncoder().encode(pasted.slice(0, 200_000));
  } else {
    return Response.json({ error: "Choose a file, or paste at least a few lines." }, { status: 400 });
  }

  // The model's digest is written against the business — here that's what
  // the wizard knows so far, which is enough context to read a menu.
  const business: Business = {
    id: "onboarding",
    owner_id: user.id,
    name: String(form.get("business_name") ?? "").trim().slice(0, 120) || "This business",
    category: String(form.get("category") ?? "").trim().slice(0, 60) || "local business",
    city: String(form.get("city") ?? "").trim().slice(0, 80) || "its city",
    region: String(form.get("region") ?? "").trim().slice(0, 40) || null,
    country: "US",
    lat: null,
    lng: null,
    radius_miles: 20,
    website: null,
    price_band: null,
    brand_voice_notes: null,
    photo_urls: [],
    created_at: new Date().toISOString(),
  };

  try {
    const { text, digest, model_used } = await digestUpload(business, { name, mime, bytes });
    const doc: OnboardingDocument = { name, mime, text: text.slice(0, MAX_ONBOARDING_DOC_TEXT), digest, model_used };
    return Response.json(doc);
  } catch (err) {
    console.warn("[import/document] read failed:", (err as Error).message);
    return Response.json({ error: "Couldn't read that file — try a PDF, Word, Excel, or pasted text." }, { status: 422 });
  }
}
