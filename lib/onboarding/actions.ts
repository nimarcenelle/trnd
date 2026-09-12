"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { fallbackDigest } from "@/lib/documents/parse";
import { cleanSocialHandles } from "@/lib/import/social-links";
import { MAX_ONBOARDING_DOC_TEXT, MAX_ONBOARDING_DOCS, type OnboardingDocument } from "@/lib/onboarding/menu-doc";

export interface OnboardingState {
  error?: string;
}

interface ServiceInput {
  name: string;
  price: string;
}

export async function completeOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const priceBand = String(formData.get("price_band") ?? "").trim();
  const brandVoice = String(formData.get("brand_voice_notes") ?? "").trim();
  const radius = Number(formData.get("radius_miles") ?? 20);

  if (!name) return { error: "Business name is required." };
  if (category.length < 3 || category.length > 60) {
    return { error: "Describe what your business is (a few words)." };
  }
  if (!city) return { error: "City is required." };

  let services: ServiceInput[] = [];
  try {
    services = JSON.parse(String(formData.get("services") ?? "[]")) as ServiceInput[];
  } catch {
    return { error: "Services could not be read — try again." };
  }
  const cleanServices = services
    .map((s) => ({ name: s.name.trim(), price: s.price.trim() }))
    .filter((s) => s.name.length > 0);
  if (cleanServices.length === 0) {
    return { error: "Add at least one service you sell." };
  }

  const repo = await getUserRepo(user.id);
  const existing = await repo.getBusinessByOwner(user.id);
  if (existing) redirect("/app");

  let photoUrls: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("photo_urls") ?? "[]")) as unknown;
    if (Array.isArray(parsed)) {
      photoUrls = parsed.filter((p): p is string => typeof p === "string" && /^https?:\/\//.test(p)).slice(0, 6);
    }
  } catch {
    /* photos are a nice-to-have — never block onboarding on them */
  }

  // The accounts their site links to. The field is client-supplied, so only
  // the three platforms and well-formed handles survive; a bad value drops
  // to none rather than stopping setup.
  let socialHandles = {};
  try {
    socialHandles = cleanSocialHandles(JSON.parse(String(formData.get("social_handles") ?? "{}")) as unknown);
  } catch {
    /* handles are a nice-to-have too */
  }

  // Menus read during onboarding — kept as the business's first documents.
  // Plural: prices are routinely split across a food menu, a drinks menu and
  // a seasonal one, and reading only the first leaves the rest behind.
  const documents: OnboardingDocument[] = [];
  try {
    // `document` is the pre-multi-upload field name; still accepted so a
    // form rendered before this shipped still saves its menu.
    const raw = String(formData.get("documents") ?? formData.get("document") ?? "");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of list.slice(0, MAX_ONBOARDING_DOCS)) {
        const d = entry as Partial<OnboardingDocument>;
        if (!d || typeof d.name !== "string" || typeof d.mime !== "string" || typeof d.text !== "string") continue;
        const text = d.text.slice(0, MAX_ONBOARDING_DOC_TEXT);
        const digest =
          d.digest && Array.isArray(d.digest.facts) && Array.isArray(d.digest.services_found)
            ? d.digest
            : fallbackDigest(d.name, d.mime, text);
        documents.push({
          name: d.name.slice(0, 120),
          mime: d.mime.slice(0, 100),
          text,
          digest,
          model_used: typeof d.model_used === "string" ? d.model_used.slice(0, 80) : "trnd-template/v1",
        });
      }
    }
  } catch {
    /* the services they produced are already in the rows — the documents are a bonus */
  }

  const business = await repo.createBusiness({
    owner_id: user.id,
    name,
    category,
    city,
    region: region || null,
    country: "US",
    lat: null,
    lng: null,
    radius_miles: Number.isFinite(radius) ? Math.min(100, Math.max(1, Math.round(radius))) : 20,
    website: website || null,
    price_band: priceBand || null,
    brand_voice_notes: brandVoice || null,
    photo_urls: photoUrls,
    social_handles: socialHandles,
  });

  // Start the 14-day trial clock the moment the business exists.
  try {
    const { getOrCreateSubscription } = await import("@/lib/billing");
    await getOrCreateSubscription(repo, business);
  } catch (err) {
    console.warn("[onboarding] trial subscription init failed (non-fatal):", (err as Error).message);
  }

  const createdServices = await repo.createServices(
    cleanServices.map((s) => {
      const parsed = Math.round(parseFloat(s.price.replace(/[^0-9.]/g, "")) * 100);
      return {
        business_id: business.id,
        name: s.name,
        description: null,
        price_cents: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
        is_active: true,
      };
    }),
  );

  for (const document of documents) {
    try {
      await repo.createDocument({
        business_id: business.id,
        name: document.name,
        mime: document.mime,
        bytes: new TextEncoder().encode(document.text).byteLength,
        text: document.text,
        digest: document.digest,
        model_used: document.model_used,
      });
    } catch (err) {
      console.warn("[onboarding] saving a menu document failed (non-fatal):", (err as Error).message);
    }
  }

  // The joining gift: TRND's full analysis of the business — positioning,
  // customers, market, pricing, seasonality, and first moves. It takes the
  // model a minute, so it's written AFTER the redirect: the owner lands on
  // the dashboard immediately and the snapshot fills in behind them. The
  // site text the import already fetched feeds it, so no refetch here.
  after(() =>
    import("@/lib/notify").then(({ notifyFounder }) =>
      notifyFounder({
        kind: "signup",
        email: user.email,
        businessName: business.name,
        category: business.category,
        city: business.city,
      }),
    ),
  );

  // The brief reads the menu the owner handed over alongside the site.
  const siteTextRaw = String(formData.get("site_text") ?? "").slice(0, 12_000);
  const siteText =
    [
      siteTextRaw,
      // Every menu handed over, so the brief prices from all of them rather
      // than whichever happened to be uploaded first.
      ...documents.map((d) => `=== DOCUMENT ${d.name} ===\n${d.text.slice(0, 8_000)}`),
    ]
      .filter(Boolean)
      .join("\n\n") || undefined;
  after(async () => {
    // Ingest and ranking write shared tables (signals, signal_series,
    // opportunities) that RLS keeps read-only for user sessions — the jobs
    // run on the service repo, same as the crons. Ownership was already
    // established above through the user-scoped repo.
    const { getAdminRepo } = await import("@/lib/db/admin");
    const jobRepo = getAdminRepo();
    try {
      const brief = await generateBusinessBrief(business, createdServices, siteText);
      await repo.upsertBusinessBrief(brief);
      // Day-one demand reads for the new watch terms (news, ads, search
      // volume) — tolerated failure; the ranking works without them.
      try {
        const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
        await runSignalIngestForBusiness(jobRepo, business);
      } catch (err) {
        console.warn("[onboarding] day-one signal ingest failed (non-fatal):", (err as Error).message);
      }
      // The dashboard's first ranking ran before the analysis existed —
      // re-rank now so it's snapshot-judged, not category-matched.
      const { rerankWeek } = await import("@/lib/recommend/rerank");
      await rerankWeek(jobRepo, business);
    } catch (err) {
      console.warn("[onboarding] brief generation failed (non-fatal):", (err as Error).message);
    }
    // The rivals an owner would name, found for them — before the first
    // intel read so day one already holds their ads and ratings.
    try {
      const { seedCompetitors } = await import("@/lib/intel/seed-competitors");
      const seeded = await seedCompetitors(jobRepo, business);
      if (seeded.note) console.log(`[onboarding] rivals: ${seeded.note}`);
    } catch (err) {
      console.warn("[onboarding] rival discovery failed (non-fatal):", (err as Error).message);
    }
    // Day-one intel, not cron-day intel: resolve the Google listing, pull
    // reviews, mine the digest — so Ask and the report have voice-of-customer
    // from the first session.
    try {
      const { runIntelIngestForBusiness } = await import("@/lib/intel/ingest");
      await runIntelIngestForBusiness(jobRepo, business);
    } catch (err) {
      console.warn("[onboarding] intel ingest failed (non-fatal):", (err as Error).message);
    }
  });

  redirect("/app");
}
