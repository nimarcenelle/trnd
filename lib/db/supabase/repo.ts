import type { SupabaseClient } from "@supabase/supabase-js";

import type { Repo } from "../repo";
import type {
  Business,
  BusinessBrief,
  Campaign,
  CampaignResult,
  Alert,
  Competitor,
  CompetitorRead,
  Connection,
  Creative,
  DemoRequest,
  PublicSnapshot,
  IntelNote,
  Learning,
  Opportunity,
  PickRead,
  StandingQuestion,
  BusinessDocument,
  Review,
  ReviewDigest,
  Profile,
  Service,
  Signal,
  SignalSeriesPoint,
  Subscription,
} from "../types";

function throwIf(error: { message: string } | null, ctx: string): void {
  if (error) throw new Error(`[supabase:${ctx}] ${error.message}`);
}

const UNIQUE_VIOLATION = "23505";

/**
 * Thin passthrough over supabase-js. Row shapes equal the domain types, so
 * there is no mapping layer. Ownership is enforced by RLS on the server —
 * pass a request-scoped client for user ops, the admin client for cron.
 */
export function createSupabaseRepo(sb: SupabaseClient): Repo {
  return {
    async getProfile(userId) {
      const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      throwIf(error, "getProfile");
      return (data as Profile | null) ?? null;
    },

    async createBusiness(input) {
      const { data, error } = await sb.from("businesses").insert(input).select().single();
      throwIf(error, "createBusiness");
      return data as Business;
    },
    async getBusinessByOwner(ownerId) {
      const { data, error } = await sb
        .from("businesses")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      throwIf(error, "getBusinessByOwner");
      return (data as Business | null) ?? null;
    },
    async getBusiness(id) {
      const { data, error } = await sb.from("businesses").select("*").eq("id", id).maybeSingle();
      throwIf(error, "getBusiness");
      return (data as Business | null) ?? null;
    },
    async updateBusiness(id, patch) {
      const { data, error } = await sb
        .from("businesses")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      throwIf(error, "updateBusiness");
      return data as Business;
    },
    async listAllBusinesses() {
      const { data, error } = await sb.from("businesses").select("*");
      throwIf(error, "listAllBusinesses");
      return (data ?? []) as Business[];
    },

    async createServices(inputs) {
      if (inputs.length === 0) return [];
      const { data, error } = await sb.from("services").insert(inputs).select();
      throwIf(error, "createServices");
      return (data ?? []) as Service[];
    },
    async listServices(businessId) {
      const { data, error } = await sb.from("services").select("*").eq("business_id", businessId);
      throwIf(error, "listServices");
      return (data ?? []) as Service[];
    },
    async updateService(id, patch) {
      const { data, error } = await sb.from("services").update(patch).eq("id", id).select().single();
      throwIf(error, "updateService");
      return data as Service;
    },
    async deleteService(id) {
      const { error } = await sb.from("services").delete().eq("id", id);
      throwIf(error, "deleteService");
    },

    async upsertSignals(inputs) {
      // The daily-dedupe unique index is on an expression (captured_at::date),
      // which PostgREST upsert can't target — insert row-by-row and treat
      // 23505 as "already captured today".
      let written = 0;
      for (const input of inputs) {
        const { error } = await sb.from("signals").insert(input);
        if (error && error.code === UNIQUE_VIOLATION) continue;
        throwIf(error, "upsertSignals");
        written += 1;
      }
      return written;
    },
    async listSignalsForCategory(category, opts) {
      // Sample rows (source "seed") exist for local development only; a
      // production workspace never ranks, charts, or cites them.
      const sinceDays = opts?.sinceDays ?? 14;
      const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
      let q = sb.from("signals").select("*").eq("category", category).gte("captured_at", cutoff).neq("source", "seed");
      // National rows, the business's state, and any metro inside it
      // ("US-GA-524" for a "US-GA" query) rank together.
      if (opts?.geo) q = q.or(`geo.eq.US,geo.eq.${opts.geo},geo.like.${opts.geo}-%`);
      // nullsFirst: false — Postgres puts NULLs first on DESC by default,
      // which let a term's null-delta evergreen row shadow its measured
      // sibling (same term, real delta) at the dedupe step downstream.
      const { data, error } = await q.order("delta_pct", { ascending: false, nullsFirst: false });
      throwIf(error, "listSignalsForCategory");
      return (data ?? []) as Signal[];
    },
    async getSignal(id) {
      const { data, error } = await sb.from("signals").select("*").eq("id", id).maybeSingle();
      throwIf(error, "getSignal");
      return (data as Signal | null) ?? null;
    },
    async upsertSeriesPoints(points) {
      if (points.length === 0) return 0;
      // One batch can carry the same (term, geo, day) twice — e.g. two TikTok
      // hashtags humanizing to one term. Postgres rejects updating a row twice
      // in a single ON CONFLICT statement; keep the last write per key.
      const byKey = new Map<string, (typeof points)[number]>();
      for (const p of points) byKey.set(`${p.normalized_term}|${p.geo}|${p.day}`, p);
      const rows = [...byKey.values()];
      const { error, count } = await sb
        .from("signal_series")
        .upsert(rows, { onConflict: "normalized_term,geo,day", count: "exact" });
      throwIf(error, "upsertSeriesPoints");
      return count ?? rows.length;
    },
    async getSeries(normalizedTerm, geo, days = 30) {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await sb
        .from("signal_series")
        .select("*")
        .eq("normalized_term", normalizedTerm)
        .eq("geo", geo)
        .gte("day", cutoff)
        .order("day");
      throwIf(error, "getSeries");
      return (data ?? []) as SignalSeriesPoint[];
    },
    async countSignalsCapturedOn(day, source) {
      let q = sb
        .from("signals")
        .select("id", { count: "exact", head: true })
        .gte("captured_at", `${day}T00:00:00Z`)
        .lt("captured_at", `${day}T23:59:59.999Z`);
      if (source) q = q.eq("source", source);
      const { count, error } = await q;
      throwIf(error, "countSignalsCapturedOn");
      return count ?? 0;
    },

    async upsertOpportunities(inputs) {
      if (inputs.length === 0) return [];
      const { data, error } = await sb
        .from("opportunities")
        .upsert(
          inputs.map((i) => ({ ...i, status: i.status ?? "new" })),
          { onConflict: "business_id,signal_id,week_of" },
        )
        .select();
      throwIf(error, "upsertOpportunities");
      return (data ?? []) as Opportunity[];
    },
    async listOpportunities(businessId, weekOf) {
      let q = sb.from("opportunities").select("*").eq("business_id", businessId);
      if (weekOf) q = q.eq("week_of", weekOf);
      const { data, error } = await q.order("score", { ascending: false });
      throwIf(error, "listOpportunities");
      return (data ?? []) as Opportunity[];
    },
    async deleteOpportunitiesForWeek(businessId, weekOf, keepIds) {
      let q = sb
        .from("opportunities")
        .delete({ count: "exact" })
        .eq("business_id", businessId)
        .eq("week_of", weekOf);
      if (keepIds.length > 0) q = q.not("id", "in", `(${keepIds.join(",")})`);
      const { count, error } = await q;
      throwIf(error, "deleteOpportunitiesForWeek");
      return count ?? 0;
    },
    async getOpportunity(id) {
      const { data, error } = await sb.from("opportunities").select("*").eq("id", id).maybeSingle();
      throwIf(error, "getOpportunity");
      return (data as Opportunity | null) ?? null;
    },
    async setOpportunityStatus(id, status) {
      const { data, error } = await sb
        .from("opportunities")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      throwIf(error, "setOpportunityStatus");
      return data as Opportunity;
    },

    async createCampaign(input, creatives) {
      const { data, error } = await sb
        .from("campaigns")
        .insert({ ...input, status: input.status ?? "draft" })
        .select()
        .single();
      throwIf(error, "createCampaign");
      const campaign = data as Campaign;
      if (creatives.length > 0) {
        const { error: cErr } = await sb
          .from("creatives")
          .insert(creatives.map((c) => ({ ...c, campaign_id: campaign.id })));
        throwIf(cErr, "createCampaign:creatives");
      }
      return campaign;
    },
    async getCampaign(id) {
      const { data, error } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
      throwIf(error, "getCampaign");
      return (data as Campaign | null) ?? null;
    },
    async getCampaignByOpportunity(opportunityId) {
      const { data, error } = await sb
        .from("campaigns")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .maybeSingle();
      throwIf(error, "getCampaignByOpportunity");
      return (data as Campaign | null) ?? null;
    },
    async replaceCampaign(id, patch, creatives) {
      const { data, error } = await sb.from("campaigns").update(patch).eq("id", id).select().single();
      throwIf(error, "replaceCampaign");
      const campaign = data as Campaign;
      const { error: dErr } = await sb.from("creatives").delete().eq("campaign_id", id);
      throwIf(dErr, "replaceCampaign:clear");
      if (creatives.length > 0) {
        const { error: cErr } = await sb
          .from("creatives")
          .insert(creatives.map((c) => ({ ...c, campaign_id: id })));
        throwIf(cErr, "replaceCampaign:creatives");
      }
      return campaign;
    },
    async listCampaigns(businessId) {
      const { data, error } = await sb
        .from("campaigns")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      throwIf(error, "listCampaigns");
      return (data ?? []) as Campaign[];
    },
    async listCreatives(campaignId) {
      const { data, error } = await sb
        .from("creatives")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("variant_index");
      throwIf(error, "listCreatives");
      return (data ?? []) as Creative[];
    },
    async setCampaignStatus(id, status) {
      const { data, error } = await sb
        .from("campaigns")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      throwIf(error, "setCampaignStatus");
      return data as Campaign;
    },

    async insertCampaignResult(input) {
      const { data, error } = await sb.from("campaign_results").insert(input).select().single();
      throwIf(error, "insertCampaignResult");
      return data as CampaignResult;
    },
    async listResultsForBusiness(businessId) {
      // Join via campaigns; RLS filters both sides.
      const { data, error } = await sb
        .from("campaign_results")
        .select("*, campaigns!inner(business_id)")
        .eq("campaigns.business_id", businessId)
        .order("recorded_at", { ascending: false });
      throwIf(error, "listResultsForBusiness");
      return ((data ?? []) as (CampaignResult & { campaigns?: unknown })[]).map((row) => {
        const r = { ...row };
        delete r.campaigns;
        return r as CampaignResult;
      });
    },
    async upsertLearning(input) {
      const { data, error } = await sb
        .from("learnings")
        .upsert({ ...input, updated_at: new Date().toISOString() }, {
          onConflict: "category,geo_bucket,angle_type",
        })
        .select()
        .single();
      throwIf(error, "upsertLearning");
      return data as Learning;
    },
    async listLearnings(category, geoBucket) {
      let q = sb.from("learnings").select("*").eq("category", category);
      if (geoBucket) q = q.eq("geo_bucket", geoBucket);
      const { data, error } = await q;
      throwIf(error, "listLearnings");
      return (data ?? []) as Learning[];
    },

    async upsertBusinessBrief(input) {
      const { data, error } = await sb
        .from("business_briefs")
        .upsert(input, { onConflict: "business_id" })
        .select()
        .single();
      throwIf(error, "upsertBusinessBrief");
      return data as BusinessBrief;
    },
    async getBusinessBrief(businessId) {
      const { data, error } = await sb
        .from("business_briefs")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      throwIf(error, "getBusinessBrief");
      return (data as BusinessBrief | null) ?? null;
    },

    async getSubscription(businessId) {
      const { data, error } = await sb
        .from("subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      throwIf(error, "getSubscription");
      return (data as Subscription | null) ?? null;
    },
    async upsertSubscription(input) {
      const { data, error } = await sb
        .from("subscriptions")
        .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "business_id" })
        .select()
        .single();
      throwIf(error, "upsertSubscription");
      return data as Subscription;
    },
    async getSubscriptionByStripeId(stripeSubscriptionId) {
      const { data, error } = await sb
        .from("subscriptions")
        .select("*")
        .eq("stripe_subscription_id", stripeSubscriptionId)
        .maybeSingle();
      throwIf(error, "getSubscriptionByStripeId");
      return (data as Subscription | null) ?? null;
    },

    async upsertIntelNote(input) {
      const { data, error } = await sb
        .from("intel_notes")
        .upsert(input, { onConflict: "business_id,week_of" })
        .select()
        .single();
      throwIf(error, "upsertIntelNote");
      return data as IntelNote;
    },
    async getIntelNote(businessId, weekOf) {
      const { data, error } = await sb
        .from("intel_notes")
        .select("*")
        .eq("business_id", businessId)
        .eq("week_of", weekOf)
        .maybeSingle();
      throwIf(error, "getIntelNote");
      return (data as IntelNote | null) ?? null;
    },
    async upsertPickRead(input) {
      const { data, error } = await sb
        .from("pick_reads")
        .upsert(input, { onConflict: "opportunity_id" })
        .select()
        .single();
      throwIf(error, "upsertPickRead");
      return data as PickRead;
    },
    async getPickRead(opportunityId) {
      const { data, error } = await sb
        .from("pick_reads")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .maybeSingle();
      throwIf(error, "getPickRead");
      return (data as PickRead | null) ?? null;
    },
    async listDocuments(businessId) {
      const { data, error } = await sb
        .from("business_documents")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      throwIf(error, "listDocuments");
      return (data ?? []) as BusinessDocument[];
    },
    async createDocument(input) {
      const { data, error } = await sb.from("business_documents").insert(input).select().single();
      throwIf(error, "createDocument");
      return data as BusinessDocument;
    },
    async deleteDocument(id) {
      const { error } = await sb.from("business_documents").delete().eq("id", id);
      throwIf(error, "deleteDocument");
    },
    async listStandingQuestions(businessId, opts) {
      let q = sb.from("standing_questions").select("*").eq("business_id", businessId);
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q.order("created_at", { ascending: true });
      throwIf(error, "listStandingQuestions");
      return (data ?? []) as StandingQuestion[];
    },
    async createStandingQuestion(input) {
      const { data, error } = await sb.from("standing_questions").insert(input).select().single();
      throwIf(error, "createStandingQuestion");
      return data as StandingQuestion;
    },
    async setStandingQuestionActive(id, active) {
      const { error } = await sb.from("standing_questions").update({ active }).eq("id", id);
      throwIf(error, "setStandingQuestionActive");
    },
    async answerStandingQuestion(id, patch) {
      const { data, error } = await sb.from("standing_questions").update(patch).eq("id", id).select().single();
      throwIf(error, "answerStandingQuestion");
      return data as StandingQuestion;
    },

    async upsertConnection(input) {
      const { data, error } = await sb
        .from("connections")
        .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "business_id,provider" })
        .select()
        .single();
      throwIf(error, "upsertConnection");
      return data as Connection;
    },
    async getConnection(businessId, provider) {
      const { data, error } = await sb
        .from("connections")
        .select("*")
        .eq("business_id", businessId)
        .eq("provider", provider)
        .maybeSingle();
      throwIf(error, "getConnection");
      return (data as Connection | null) ?? null;
    },
    async listConnections(businessId) {
      const { data, error } = await sb.from("connections").select("*").eq("business_id", businessId);
      throwIf(error, "listConnections");
      return (data ?? []) as Connection[];
    },
    async deleteConnection(businessId, provider) {
      const { error } = await sb
        .from("connections")
        .delete()
        .eq("business_id", businessId)
        .eq("provider", provider);
      throwIf(error, "deleteConnection");
    },

    async createCompetitor(input) {
      const { data, error } = await sb
        .from("competitors")
        .upsert(input, { onConflict: "business_id,name" })
        .select()
        .single();
      throwIf(error, "createCompetitor");
      return data as Competitor;
    },
    async listCompetitors(businessId) {
      const { data, error } = await sb
        .from("competitors")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at");
      throwIf(error, "listCompetitors");
      return (data ?? []) as Competitor[];
    },
    async updateCompetitor(id, patch) {
      const { data, error } = await sb.from("competitors").update(patch).eq("id", id).select().single();
      throwIf(error, "updateCompetitor");
      return data as Competitor;
    },
    async deleteCompetitor(id) {
      const { error } = await sb.from("competitors").delete().eq("id", id);
      throwIf(error, "deleteCompetitor");
    },
    async upsertCompetitorReads(inputs) {
      if (inputs.length === 0) return 0;
      const { count, error } = await sb.from("competitor_reads").upsert(
        inputs.map((i) => ({
          ...i,
          captured_at: i.captured_at ?? new Date().toISOString(),
          day: (i.captured_at ?? new Date().toISOString()).slice(0, 10),
        })),
        { onConflict: "competitor_id,kind,day", ignoreDuplicates: true, count: "exact" },
      );
      throwIf(error, "upsertCompetitorReads");
      return count ?? 0;
    },
    async listCompetitorReads(businessId, opts) {
      const since = new Date(Date.now() - (opts?.sinceDays ?? 30) * 86400_000).toISOString();
      const { data, error } = await sb
        .from("competitor_reads")
        .select("*")
        .eq("business_id", businessId)
        .gte("captured_at", since)
        .order("captured_at", { ascending: false });
      throwIf(error, "listCompetitorReads");
      return (data ?? []) as CompetitorRead[];
    },

    async upsertReviews(inputs) {
      if (inputs.length === 0) return 0;
      const { count, error } = await sb.from("reviews").upsert(
        inputs.map((i) => ({ ...i, captured_at: new Date().toISOString() })),
        { onConflict: "business_id,competitor_id,author,text", ignoreDuplicates: true, count: "exact" },
      );
      throwIf(error, "upsertReviews");
      return count ?? 0;
    },
    async listReviews(businessId, opts) {
      let q = sb.from("reviews").select("*").eq("business_id", businessId);
      if (opts?.competitorId === null) q = q.is("competitor_id", null);
      else if (opts?.competitorId) q = q.eq("competitor_id", opts.competitorId);
      const { data, error } = await q.order("published_at", { ascending: false, nullsFirst: false });
      throwIf(error, "listReviews");
      return (data ?? []) as Review[];
    },
    async upsertReviewDigest(input) {
      const { data, error } = await sb
        .from("review_digests")
        .upsert(input, { onConflict: "business_id" })
        .select()
        .single();
      throwIf(error, "upsertReviewDigest");
      return data as ReviewDigest;
    },
    async getReviewDigest(businessId) {
      const { data, error } = await sb
        .from("review_digests")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      throwIf(error, "getReviewDigest");
      return (data as ReviewDigest | null) ?? null;
    },

    async createAlert(input) {
      const { data, error } = await sb
        .from("alerts")
        .upsert(input, { onConflict: "business_id,dedupe_key", ignoreDuplicates: true })
        .select();
      throwIf(error, "createAlert");
      return ((data ?? [])[0] as Alert | undefined) ?? null;
    },
    async listAlerts(businessId, opts) {
      let q = sb.from("alerts").select("*").eq("business_id", businessId);
      if (opts?.unreadOnly) q = q.is("read_at", null);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(opts?.limit ?? 50);
      throwIf(error, "listAlerts");
      return (data ?? []) as Alert[];
    },
    async markAlertsRead(businessId, ids) {
      let q = sb
        .from("alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("business_id", businessId)
        .is("read_at", null);
      if (ids && ids.length > 0) q = q.in("id", ids);
      const { error } = await q;
      throwIf(error, "markAlertsRead");
    },

    async setCampaignExternal(id, externalId, externalStatus) {
      const { data, error } = await sb
        .from("campaigns")
        .update({ external_id: externalId, external_status: externalStatus })
        .eq("id", id)
        .select()
        .single();
      throwIf(error, "setCampaignExternal");
      return data as Campaign;
    },

    async insertDemoRequest(input) {
      let { data, error } = await sb.from("demo_requests").insert(input).select().single();
      if (error && /website/i.test(error.message)) {
        // Migration 0015 not applied yet — the website still reaches the
        // founder notification; store the rest rather than losing the lead.
        const rest = { ...input };
        delete (rest as { website?: unknown }).website;
        ({ data, error } = await sb.from("demo_requests").insert(rest).select().single());
      }
      throwIf(error, "insertDemoRequest");
      return data as DemoRequest;
    },

    async insertPublicSnapshot(input) {
      const { data, error } = await sb.from("public_snapshots").insert(input).select().single();
      throwIf(error, "insertPublicSnapshot");
      return data as PublicSnapshot;
    },
    async getPublicSnapshot(token) {
      const { data, error } = await sb
        .from("public_snapshots")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      throwIf(error, "getPublicSnapshot");
      return (data as PublicSnapshot | null) ?? null;
    },
    async getFreshPublicSnapshotByHost(host, maxAgeMs) {
      const { data, error } = await sb
        .from("public_snapshots")
        .select("*")
        .eq("host", host)
        .gte("created_at", new Date(Date.now() - maxAgeMs).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      throwIf(error, "getFreshPublicSnapshotByHost");
      return (data as PublicSnapshot | null) ?? null;
    },
  };
}
