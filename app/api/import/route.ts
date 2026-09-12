import { getSessionUser } from "@/lib/auth/session";
import { digestUpload } from "@/lib/documents/digest";
import { isGeminiConfigured } from "@/lib/env";
import {
  discoverMenuFiles,
  extractFromPages,
  fetchMenuFile,
  fetchSiteCorpus,
  inferPriceBand,
  menuFileName,
  normalizeUrl,
  probeStorefrontProducts,
  readOffsiteMenu,
  type ImportEvent,
} from "@/lib/import/website";
import {
  MAX_ONBOARDING_DOC_TEXT,
  mergeServices,
  onboardingBusiness,
  type OnboardingDocument,
} from "@/lib/onboarding/menu-doc";

// A crawl plus a model read of each menu file it turns up.
export const maxDuration = 120;

/** Site text round-trips through a hidden form field into brief generation. */
const MAX_SITE_TEXT = 16_000;

/** Shopify and WooCommerce leave fingerprints in every page's markup. */
const looksLikeStorefront = (html: string) => /shopify|\/cdn\/shop\/|woocommerce|wc-block/i.test(html);

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
        // JS-rendered storefronts (Shopify, Woo) hide the catalog from the
        // HTML crawl — their public JSON endpoints carry it instead. This is
        // the only product read that works in serverless prod for such sites.
        // Run whenever the site is one, not only when the crawl came back
        // empty: a café that also ships beans has a menu on its pages AND a
        // catalog in the store, and the owner sells both.
        if (data.services.length === 0 || looksLikeStorefront(corpus.pages[0].html)) {
          send({ type: "status", label: "Checking the online store for products…" });
          const products = await probeStorefrontProducts(url, corpus.pages[0].html);
          const seen = new Set(data.services.map((s) => s.name.toLowerCase()));
          for (const p of products) {
            if (seen.has(p.name.toLowerCase())) continue;
            seen.add(p.name.toLowerCase());
            data.services.push(p);
          }
          data.priceBand = data.priceBand ?? inferPriceBand(data.services, data.category);
        }
        // The menu on an ordering platform: one honest attempt to read it,
        // and if that fails the owner is told where it is and asked for it.
        if (data.menuHost && !data.services.some((s) => s.price)) {
          send({ type: "status", label: `Your menu is on ${data.menuHost.name} — trying to read it…` });
          const priced = await readOffsiteMenu(data.menuHost.url);
          if (priced.length > 0) {
            const seen = new Set(data.services.map((s) => s.name.toLowerCase()));
            for (const svc of priced) {
              const key = svc.name.toLowerCase();
              const existing = data.services.find((s) => s.name.toLowerCase() === key);
              if (existing) existing.price = existing.price || svc.price;
              else if (!seen.has(key) && data.services.length < 15) {
                seen.add(key);
                data.services.push(svc);
              }
            }
            data.priceBand = data.priceBand ?? inferPriceBand(data.services, data.category);
            delete data.menuHost;
          }
        }
        if (data.services.length > 0 || data.name || data.city) {
          send({ type: "partial", data });
        }

        // Menus kept in a PDF or an image on the site — the priced menu a
        // lot of restaurants have and nothing else. Read alongside the
        // refinement below, since they're the slowest thing here.
        const menuFiles = isGeminiConfigured ? discoverMenuFiles(corpus.pages) : [];
        if (menuFiles.length > 0) {
          send({
            type: "status",
            label:
              menuFiles.length === 1
                ? `Found a menu file (${menuFileName(menuFiles[0])}) — reading it…`
                : `Found ${menuFiles.length} menu files — reading them…`,
          });
        }
        const known = { name: data.name, category: data.category, city: data.city, region: data.region };
        const menuDocsRead = Promise.all(
          menuFiles.map(async (fileUrl): Promise<OnboardingDocument | null> => {
            const file = await fetchMenuFile(fileUrl);
            if (!file) return null;
            try {
              const { text, digest, model_used } = await digestUpload(onboardingBusiness(user.id, known), file);
              if (digest.services_found.length === 0 && digest.facts.length === 0) return null;
              send({
                type: "status",
                label: `Read ${file.name} — ${digest.services_found.length} item${digest.services_found.length === 1 ? "" : "s"}`,
              });
              return { name: file.name, mime: file.mime, text: text.slice(0, MAX_ONBOARDING_DOC_TEXT), digest, model_used };
            } catch (err) {
              console.warn("[import] menu file read failed:", fileUrl, (err as Error).message);
              return null;
            }
          }),
        ).then((docs) => docs.filter((d): d is OnboardingDocument => d !== null));

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
              menuHost: services.some((s) => s.price) ? undefined : data.menuHost,
            };
          } catch (err) {
            console.warn("[import] Gemini refine failed — using heuristics:", (err as Error).message);
          }
        }

        // The menu files are the owner's own priced list: they price what the
        // site named and add what it didn't. After the refinement, so it
        // can't replace them.
        const documents = await menuDocsRead;
        if (documents.length > 0) {
          // The menus lead the list: what a customer buys at the counter is
          // the business the local ad reaches, and the confirm screen shows
          // the first eight rows. The site's own items (an online catalog,
          // memberships) follow, folded in on the same containment rule so
          // an item both name is one row.
          const fromMenus = mergeServices([], documents.flatMap((d) => d.digest.services_found));
          const rows = mergeServices(
            fromMenus.filter((r) => r.name.trim()),
            data.services.map((s) => {
              const dollars = parseFloat(s.price.replace(/[^0-9.]/g, ""));
              return { name: s.name, price_cents: Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null };
            }),
          ).filter((r) => r.name.trim());
          data.services = rows;
          data.priceBand = data.priceBand ?? inferPriceBand(rows, data.category);
          if (rows.some((r) => r.price)) delete data.menuHost;
        }

        const foundAnything =
          Boolean(data.name || data.category || data.city) || data.services.length > 0;
        if (!foundAnything) {
          send({ type: "error", reason: "Reached the site but couldn't read offerings — fill in manually." });
        } else {
          send({
            type: "final",
            data,
            siteText: corpus.text.slice(0, MAX_SITE_TEXT),
            documents: documents.length > 0 ? documents : undefined,
          });
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