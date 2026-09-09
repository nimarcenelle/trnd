"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { CATEGORIES } from "@/lib/db/types";

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
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Pick a category." };
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

  const siteText = String(formData.get("site_text") ?? "").slice(0, 12_000) || undefined;
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
