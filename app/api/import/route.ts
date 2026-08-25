import { getSessionUser } from "@/lib/auth/session";
import { isGeminiConfigured } from "@/lib/env";
import {
  extractFromPages,
  fetchSiteCorpus,
  inferPriceBand,
  normalizeUrl,
  type ImportEvent,
} from "@/lib/import/website";

/** Site text round-trips through a hidden form field into brief generation. */
const MAX_SITE_TEXT = 12_000;

/**
 * Owner-initiated read of their own website during onboarding, streamed as
 * NDJSON progress events: the crawl narrates page by page, heuristics land
 * as a `partial` prefill, and the Gemini refinement follows as `final`.
 * Failure is normal and non-blocking — onboarding continues manually.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return json({ type: "error", reason: "Not signed in." }, 401);

  // Server actions get origin checks for free; this handler does its own.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return json({ type: "error", reason: "Bad origin." }, 403);
  }

  let rawUrl = "";
  try {
    rawUrl = String(((await req.json()) as { url?: string }).url ?? "");
  } catch {
    /* fall through to the normalizeUrl error */
  }
  const url = normalizeUrl(rawUrl);
  if (!url) return json({ type: "error", reason: "That doesn't look like a web address." }, 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ImportEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      // Owner-facing narration — plain words, no plumbing. "/chapel-hill-book-now/"
      // reads as "chapel hill book now"; the homepage reads as "your home page".
      const pageName = (path: string) => {
        const slug = path.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
        return slug ? `your ${slug.replace(/[-_]/g, " ")} page` : "your home page";
      };
      try {
        send({ type: "status", label: `Opening ${new URL(url).hostname.replace(/^www\./, "")}…` });
        const corpus = await fetchSiteCorpus(url, (e) => {
          if (e.kind === "rendering") {
            send({ type: "status", label: `Taking a closer look at ${pageName(e.path)}…` });
          } else if (e.kind === "links") {
            // Only name pages with readable slugs — "/locations" yes, "/102348" no.
            const names = e.paths
              .map((p) => pageName(p).replace(/^your /, "").replace(/ page$/, ""))
              .filter((n) => /[a-z]/i.test(n))
              .slice(0, 3);
            send({
              type: "status",
              label:
                `Found ${e.paths.length} more page${e.paths.length === 1 ? "" : "s"} worth reading` +
                (names.length > 0 ? ` — ${names.join(", ")}` : ""),
            });
          } else {
            send({ type: "status", label: `Read ${pageName(e.path)}` });
          }
        });

        let data = extractFromPages(corpus.pages);
        if (data.services.length > 0 || data.name || data.city) {
          send({ type: "partial", data });
        }

        if (isGeminiConfigured) {
          send({ type: "status", label: "Making sense of what we found…" });
          try {
            const { extractSiteWithGemini } = await import("@/lib/ai/gemini");
            const refined = await extractSiteWithGemini(corpus.text, url);
            // Gemini wins where it found something; heuristics fill its gaps.
            const services = refined.services.length > 0 ? refined.services : data.services;
            const category = refined.category ?? data.category;
            data = {
              name: refined.name ?? data.name,
              category,
              city: refined.city ?? data.city,
              region: refined.region ?? data.region,
              services,
              voiceHint: refined.voiceHint ?? data.voiceHint,
              priceBand: refined.priceBand ?? inferPriceBand(services, category) ?? data.priceBand,
              photos: data.photos,
            };
          } catch (err) {
            console.warn("[import] Gemini refine failed — using heuristics:", (err as Error).message);
          }
        }

        const foundAnything =
          Boolean(data.name || data.category || data.city) || data.services.length > 0;
        if (!foundAnything) {
          send({ type: "error", reason: "Reached the site but couldn't read offerings — fill in manually." });
        } else {
          send({ type: "final", data, siteText: corpus.text.slice(0, MAX_SITE_TEXT) });
        }
      } catch (err) {
        send({
          type: "error",
          reason: `Couldn't reach the site (${(err as Error).message.slice(0, 60)}) — fill in the details manually.`,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Defeats proxy buffering so events arrive as they happen.
      "x-accel-buffering": "no",
    },
  });
}

function json(event: ImportEvent, status: number): Response {
  return new Response(`${JSON.stringify(event)}\n`, {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}