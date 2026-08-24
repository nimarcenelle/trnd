import type { SupabaseClient } from "@supabase/supabase-js";

import type { Repo } from "../repo";
import type {
  Business,
  BusinessBrief,
  Campaign,
  CampaignResult,
  Creative,
  DemoRequest,
  Learning,
  Opportunity,
  Profile,
  Service,
  Signal,
  SignalSeriesPoint,
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
      const sinceDays = opts?.sinceDays ?? 14;
      const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
      let q = sb.from("signals").select("*").eq("category", category).gte("captured_at", cutoff);
      if (opts?.geo) q = q.in("geo", [opts.geo, "US"]);
      const { data, error } = await q.order("delta_pct", { ascending: false });
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
      const { error, count } = await sb
        .from("signal_series")
        .upsert(points, { onConflict: "normalized_term,geo,day", count: "exact" });
      throwIf(error, "upsertSeriesPoints");
      return count ?? points.length;
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

    async insertDemoRequest(input) {
      const { data, error } = await sb.from("demo_requests").insert(input).select().single();
      throwIf(error, "insertDemoRequest");
      return data as DemoRequest;
    },
  };
}
