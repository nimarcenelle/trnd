import type { Business, DocumentDigest } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";

import { extractText, fallbackDigest, isModelRead } from "./parse";

export const DIGEST_FALLBACK_MODEL = "trnd-template/v1";

/**
 * Upload → text → digest. Text-like files are read here and handed to the
 * model as text; a PDF is handed to the model as bytes and its extracted
 * text is what gets stored. Without a model the deterministic digest stands
 * (and says so), so the upload never fails for want of a key.
 */
export async function digestUpload(
  business: Business,
  doc: { name: string; mime: string; bytes: Uint8Array },
): Promise<{ text: string; digest: DocumentDigest; model_used: string }> {
  const text = await extractText(doc.mime, doc.bytes);
  if (isGeminiConfigured) {
    try {
      const { digestDocumentWithGemini } = await import("@/lib/ai/gemini");
      const { value, model } = await digestDocumentWithGemini(business, {
        name: doc.name,
        mime: doc.mime,
        text,
        bytes: isModelRead(doc.mime) ? doc.bytes : null,
      });
      // A PDF or photo's stored text is the model's own account of it — the facts
      // and summary — since nothing else could read the bytes.
      return {
        text: text ?? [value.summary, ...value.facts].join("\n"),
        digest: value,
        model_used: model,
      };
    } catch (err) {
      console.warn("[documents] model digest failed — using deterministic fallback:", (err as Error).message);
    }
  }
  return { text: text ?? "", digest: fallbackDigest(doc.name, doc.mime, text), model_used: DIGEST_FALLBACK_MODEL };
}

/** The FACTS lines a business's documents contribute, for a model to cite. */
export function documentFacts(docs: { name: string; digest: DocumentDigest }[], max = 16): string[] {
  const out: string[] = [];
  for (const d of docs) {
    for (const f of d.digest.facts) {
      out.push(`From "${d.name}" (${d.digest.kind}): ${f}`);
      if (out.length >= max) return out;
    }
    for (const w of d.digest.watchouts.slice(0, 2)) {
      out.push(`From "${d.name}" (${d.digest.kind}) — watch out: ${w}`);
      if (out.length >= max) return out;
    }
  }
  return out;
}
