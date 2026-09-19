import type { SupabaseClient } from "@supabase/supabase-js";

import { MAX_AD_HISTORY_READ, type Repo } from "../repo";
import type {
  BrandPick,
  PickEvidence,
  PickRun,
  WeekSkip,
  PickScript,
  PickFeedback,
  SignalReading,
  AdHistory,
  BusinessMember,
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
  SocialPost,
  SocialComment,
  AiUsage,
  PilotApplication,
  ProviderUsage,
  Subscription,
  StrategyReadRow,
} from "../types";

/** A business row read before 0022 carries none of its columns. */
function withBusinessDefaults(b: Business): Business {
  if (!b) return b;
  return {
    ...b,
    social_handles: b.social_handles ?? {},
    market: b.market ?? "local",
    monthly_ad_spend: b.monthly_ad_spend ?? null,
    ad_platforms: b.ad_platforms ?? [],
    campaign_objectives: b.campaign_objectives ?? [],
  };
}

function throwIf(error: { message: string } | null, ctx: string): void {
  if (error) throw new Error(`[supabase:${ctx}] ${error.message}`);
}

/**
 * A table that a later migration adds and production hasn't run yet.
 * Reads of optional, additive tables (pick reads, standing questions,
 * documents) treat that as "nothing there" so one unapplied migration
 * doesn't take down every screen — writes still fail loudly.
 */
function isMissingTable(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(error.message)
  );
}
/** Memory and fit come first (they are the owner's own history), then holds
 * by how close they came. */
function sortSkips(rows: WeekSkip[]): WeekSkip[] {
  const order: Record<WeekSkip["kind"], number> = { memory: 0, fit: 1, hold: 2 };
  return [...rows].sort(
    (a, b) => order[a.kind] - order[b.kind] || Number(b.grade_score ?? 0) - Number(a.grade_score ?? 0) || a.term.localeCompare(b.term),
  );
}
function throwUnlessMissing(error: { code?: string; message: string } | null, ctx: string): void {
  if (isMissingTable(error)) {
    console.warn(`[supabase:${ctx}] table missing — run the pending migrations (supabase/migrations). Reading as empty.`);
    return;
  }
  throwIf(error, ctx);
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

type WriteResult = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A column a later migration adds that production hasn't run yet. Migrations
 * are pasted into the SQL editor by hand, so code routinely ships ahead of
 * them; 0022 (social handles, market, the target customer, rival directness)
 * is the case this was written for. Returns the column name, or null.
 */
function missingColumn(error: WriteResult["error"]): string | null {
  if (!error) return null;
  const m =
    /could not find the '([^']+)' column/i.exec(error.message) ??
    /column "?([a-z_]+)"? of relation .* does not exist/i.exec(error.message);
  return m && (error.code === "PGRST204" || error.code === "42703" || /column/i.test(error.message)) ? m[1] : null;
}

function omit(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

/**
 * Run a write; if it names a column the database doesn't have yet, drop that
 * column and try again. A write losing the new feature's field beats onboarding
 * failing outright because a migration hasn't been pasted.
 */
async function writeTolerant<Row extends object>(
  row: Row | Row[],
  run: (row: Record<string, unknown> | Record<string, unknown>[]) => PromiseLike<WriteResult>,
  ctx: string,
): Promise<WriteResult> {
  let current: Record<string, unknown> | Record<string, unknown>[] = Array.isArray(row)
    ? row.map((r) => ({ ...(r as Record<string, unknown>) }))
    : { ...(row as Record<string, unknown>) };
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await run(current);
    const column = missingColumn(result.error);
    if (!column) return result;
    console.warn(`[supabase:${ctx}] column "${column}" missing — run migration 0022. Writing without it.`);
    current = Array.isArray(current) ? current.map((r) => omit(r, column)) : omit(current, column);
  }
  return run(current);
}

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
      const { data, error } = await writeTolerant(
        input,
        (row) => sb.from("businesses").insert(row).select().single(),
        "createBusiness",
      );
      throwIf(error, "createBusiness");
      return withBusinessDefaults(data as Business);
    },
    async getBusinessByOwner(ownerId) {
      // The founder's own brand, never one of the prospect shadow brands
      // the free account read creates under the same owner.
      const { data, error } = await sb.from("businesses").select("*").eq("owner_id", ownerId).order("created_at").limit(20);
      throwIf(error, "getBusinessByOwner");
      const own = ((data ?? []) as Business[]).find((b) => !b.prospect);
      return own ? withBusinessDefaults(own) : null;
    },
    async getBusinessForUser(user) {
      const own = await this.getBusinessByOwner(user.id);
      if (own) return own;
      const email = (user.email ?? "").trim().toLowerCase().replace(/[%_,()]/g, "");
      let q = sb.from("business_members").select("*").order("created_at").limit(1);
      q = email ? q.or(`user_id.eq.${user.id},email.ilike.${email}`) : q.eq("user_id", user.id);
      const { data, error } = await q.maybeSingle();
      // Before migration 0034 there is no roster: the user has no business.
      if (error && (missingColumn(error) || /business_members/.test(error.message))) return null;
      throwIf(error, "getBusinessForUser:members");
      const member = data as BusinessMember | null;
      if (!member) return null;
      if (!member.user_id) {
        // First sign-in claims the invitation; a failure here costs nothing.
        await sb.from("business_members").update({ user_id: user.id, accepted_at: new Date().toISOString() }).eq("id", member.id);
      }
      return this.getBusiness(member.business_id);
    },
    async getBusiness(id) {
      const { data, error } = await sb.from("businesses").select("*").eq("id", id).maybeSingle();
      throwIf(error, "getBusiness");
      return data ? withBusinessDefaults(data as Business) : null;
    },

    /* --------------------------------- team -------------------------------- */
    async listMembers(businessId) {
      const { data, error } = await sb.from("business_members").select("*").eq("business_id", businessId).order("created_at");
      throwUnlessMissing(error, "listMembers");
      return (data ?? []) as BusinessMember[];
    },
    async inviteMember(input) {
      const row = { business_id: input.business_id, email: input.email.trim().toLowerCase(), invited_by: input.invited_by ?? null };
      const { data, error } = await sb.from("business_members").upsert(row, { onConflict: "business_id,email" }).select().single();
      throwIf(error, "inviteMember");
      return data as BusinessMember;
    },
    async removeMember(id) {
      const { error } = await sb.from("business_members").delete().eq("id", id);
      throwIf(error, "removeMember");
    },
    async findMembershipByEmail(email) {
      const { data, error } = await sb.from("business_members").select("*").ilike("email", email.trim().toLowerCase()).limit(1).maybeSingle();
      throwUnlessMissing(error, "findMembershipByEmail");
      return (data as BusinessMember | null) ?? null;
    },

    /* -------------------------------- share -------------------------------- */
    async setPickShareToken(pickId, token) {
      const { error } = await sb.from("picks").update({ share_token: token }).eq("id", pickId);
      throwIf(error, "setPickShareToken");
    },
    async getPickDetailByShareToken(token) {
      const { data, error } = await sb.from("picks").select("id,business_id").eq("share_token", token).maybeSingle();
      throwUnlessMissing(error, "getPickDetailByShareToken");
      const row = data as { id: string; business_id: string } | null;
      if (!row) return null;
      const [detail, business] = await Promise.all([this.getPickDetail(row.id), this.getBusiness(row.business_id)]);
      return detail && business ? { detail, business } : null;
    },
    async updateBusiness(id, patch) {
      const { data, error } = await writeTolerant(
        patch,
        (row) => sb.from("businesses").update(row).eq("id", id).select().single(),
        "updateBusiness",
      );
      throwIf(error, "updateBusiness");
      return withBusinessDefaults(data as Business);
    },
    async listAllBusinesses(opts) {
      const { data, error } = await sb.from("businesses").select("*");
      throwIf(error, "listAllBusinesses");
      return ((data ?? []) as Business[]).filter((b) => opts?.includeProspects || !b.prospect).map(withBusinessDefaults);
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
    async getSignalsByIds(ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];
      // PostgREST puts the id list in the query string; 200 uuids keep it
      // well under the URL limit.
      const chunks: string[][] = [];
      for (let i = 0; i < unique.length; i += 200) chunks.push(unique.slice(i, i + 200));
      const pages = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await sb.from("signals").select("*").in("id", chunk);
          throwIf(error, "getSignalsByIds");
          return (data ?? []) as Signal[];
        }),
      );
      return pages.flat();
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
    async expireYoutubeData(maxAgeDays) {
      const cutoff = new Date(Date.now() - maxAgeDays * 86400_000);
      const { error: scrubError, count: signalsScrubbed } = await sb
        .from("signals")
        .update({ value: null, delta_pct: null, raw: null }, { count: "exact" })
        .eq("source", "youtube")
        .lt("captured_at", cutoff.toISOString())
        .or("raw.not.is.null,value.not.is.null");
      throwIf(scrubError, "expireYoutubeData:signals");
      const { error: seriesError, count: seriesDeleted } = await sb
        .from("signal_series")
        .delete({ count: "exact" })
        .lt("day", cutoff.toISOString().slice(0, 10));
      throwIf(seriesError, "expireYoutubeData:series");
      return { signalsScrubbed: signalsScrubbed ?? 0, seriesDeleted: seriesDeleted ?? 0 };
    },

    async upsertOpportunities(inputs) {
      if (inputs.length === 0) return [];
      // grade, grade_score and signal_scores arrive with migration 0024; until
      // it is pasted the ranking keeps writing without them.
      const { data, error } = await writeTolerant(
        inputs.map((i) => ({ ...i, status: i.status ?? "new" })),
        (rows) => sb.from("opportunities").upsert(rows, { onConflict: "business_id,signal_id,week_of" }).select(),
        "upsertOpportunities",
      );
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
      const { data, error } = await writeTolerant(
        input,
        (row) => sb.from("business_briefs").upsert(row, { onConflict: "business_id" }).select().single(),
        "upsertBusinessBrief",
      );
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
    async upsertStrategyRead(input) {
      const { data, error } = await sb
        .from("strategy_reads")
        .upsert(input, { onConflict: "business_id,week_of" })
        .select()
        .single();
      if (isMissingTable(error)) {
        console.warn("[supabase:upsertStrategyRead] table missing — run the pending migrations (supabase/migrations). Not stored.");
        return null;
      }
      throwIf(error, "upsertStrategyRead");
      return data as StrategyReadRow;
    },
    async getStrategyRead(businessId, weekOf) {
      const { data, error } = await sb
        .from("strategy_reads")
        .select("*")
        .eq("business_id", businessId)
        .eq("week_of", weekOf)
        .maybeSingle();
      throwUnlessMissing(error, "getStrategyRead");
      return (data as StrategyReadRow | null) ?? null;
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
      throwUnlessMissing(error, "getPickRead");
      return (data as PickRead | null) ?? null;
    },
    async listDocuments(businessId) {
      const { data, error } = await sb
        .from("business_documents")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      throwUnlessMissing(error, "listDocuments");
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
      throwUnlessMissing(error, "listStandingQuestions");
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
      const { data, error } = await writeTolerant(
        input,
        (row) => sb.from("competitors").upsert(row, { onConflict: "business_id,name" }).select().single(),
        "createCompetitor",
      );
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
      const { data, error } = await writeTolerant(
        patch,
        (row) => sb.from("competitors").update(row).eq("id", id).select().single(),
        "updateCompetitor",
      );
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
      if (error?.code === CHECK_VIOLATION && inputs.some((i) => i.kind === "social" || i.kind === "google_ads")) {
        // Before 0022 the kind check only knows ads/reviews/site. Keep those.
        console.warn("[supabase:upsertCompetitorReads] social/google_ads kinds rejected — run migration 0022.");
        const legacy = inputs.filter((i) => i.kind !== "social" && i.kind !== "google_ads");
        return legacy.length > 0 ? this.upsertCompetitorReads(legacy) : 0;
      }
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

    async upsertSocialPosts(inputs) {
      if (inputs.length === 0) return 0;
      // The identity index treats a null competitor as the zero uuid, so the
      // conflict target is expressed the same way here.
      const { count, error } = await sb.from("social_posts").upsert(
        inputs.map((i) => ({ ...i, captured_at: new Date().toISOString() })),
        {
          onConflict: "business_id,coalesce(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid),platform,external_id",
          count: "exact",
        },
      );
      if (isMissingTable(error)) {
        console.warn("[supabase:upsertSocialPosts] social_posts missing — run migration 0022. Posts not kept.");
        return 0;
      }
      if (error) {
        // PostgREST cannot always express an expression index as a conflict
        // target — fall back to insert-ignore, which keeps first captures.
        const { count: c2, error: e2 } = await sb
          .from("social_posts")
          .insert(inputs.map((i) => ({ ...i, captured_at: new Date().toISOString() })), { count: "exact" });
        if (e2 && !/duplicate key/i.test(e2.message)) throwIf(e2, "upsertSocialPosts");
        return c2 ?? 0;
      }
      return count ?? 0;
    },
    async listSocialPosts(businessId, opts) {
      const since = new Date(Date.now() - (opts?.sinceDays ?? 90) * 86400_000).toISOString();
      let q = sb.from("social_posts").select("*").eq("business_id", businessId).gte("captured_at", since);
      if (opts?.competitorId === null) q = q.is("competitor_id", null);
      else if (opts?.competitorId) q = q.eq("competitor_id", opts.competitorId);
      if (opts?.platform) q = q.eq("platform", opts.platform);
      const { data, error } = await q.order("posted_at", { ascending: false, nullsFirst: false });
      throwUnlessMissing(error, "listSocialPosts");
      return (data ?? []) as SocialPost[];
    },
    async setSocialPostKinds(kinds) {
      for (const k of kinds) {
        const { error } = await sb.from("social_posts").update({ kind: k.kind }).eq("id", k.id);
        throwIf(error, "setSocialPostKinds");
      }
    },

    async upsertSocialComments(inputs) {
      if (inputs.length === 0) return 0;
      const { count, error } = await sb.from("social_comments").upsert(
        inputs.map((i) => ({ ...i, captured_at: new Date().toISOString() })),
        { onConflict: "business_id,platform,external_id", ignoreDuplicates: true, count: "exact" },
      );
      if (isMissingTable(error)) {
        console.warn("[supabase:upsertSocialComments] social_comments missing — run migration 0027. Comments not kept.");
        return 0;
      }
      throwIf(error, "upsertSocialComments");
      return count ?? 0;
    },
    async listSocialComments(businessId, opts) {
      const since = new Date(Date.now() - (opts?.sinceDays ?? 90) * 86400_000).toISOString();
      let q = sb.from("social_comments").select("*").eq("business_id", businessId).gte("captured_at", since);
      if (opts?.competitorId === null) q = q.is("competitor_id", null);
      else if (opts?.competitorId) q = q.eq("competitor_id", opts.competitorId);
      const { data, error } = await q.order("posted_at", { ascending: false, nullsFirst: false });
      throwUnlessMissing(error, "listSocialComments");
      return (data ?? []) as SocialComment[];
    },

    async recordAiUsage(input) {
      const { error } = await sb.from("ai_usage").insert(input);
      if (isMissingTable(error)) return;
      throwIf(error, "recordAiUsage");
    },
    async listAiUsage(opts) {
      const since = new Date(Date.now() - (opts?.sinceHours ?? 24) * 3_600_000).toISOString();
      let q = sb.from("ai_usage").select("*").gte("created_at", since);
      if (opts?.businessId) q = q.eq("business_id", opts.businessId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(5000);
      throwUnlessMissing(error, "listAiUsage");
      return (data ?? []) as AiUsage[];
    },

    async recordProviderUsage(input) {
      const { error } = await sb.from("provider_usage").insert(input);
      // Until 0028 is pasted the call still runs; only the meter is missing.
      if (isMissingTable(error)) return;
      throwIf(error, "recordProviderUsage");
    },
    async listProviderUsage(opts) {
      const since = new Date(Date.now() - (opts?.sinceHours ?? 24) * 3_600_000).toISOString();
      let q = sb.from("provider_usage").select("*").gte("created_at", since);
      if (opts?.businessId) q = q.eq("business_id", opts.businessId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(5000);
      throwUnlessMissing(error, "listProviderUsage");
      return (data ?? []) as ProviderUsage[];
    },

    async upsertAdHistory(inputs) {
      if (inputs.length === 0) return 0;
      // The depth columns land with migration 0032; until it is pasted the
      // rows still land without them.
      let written = 0;
      const { error } = await writeTolerant(
        inputs,
        async (rows) => {
          const res = await sb.from("ad_history").upsert(rows as Record<string, unknown>[], {
            onConflict: "business_id,platform,campaign_name,ad_name,started_on",
            ignoreDuplicates: true,
            count: "exact",
          });
          written = res.count ?? 0;
          return { data: null, error: res.error };
        },
        "upsertAdHistory",
      );
      throwIf(error, "upsertAdHistory");
      return written;
    },
    async setAdHistoryClassification(rows) {
      for (const { id, ...patch } of rows) {
        const { error } = await sb.from("ad_history").update(patch).eq("id", id);
        if (error && missingColumn(error)) return;
        throwIf(error, "setAdHistoryClassification");
      }
    },
    async linkAdHistoryToRun(adHistoryId, runId) {
      const { error } = await sb.from("ad_history").update({ run_id: runId }).eq("id", adHistoryId);
      if (error && missingColumn(error)) return;
      throwIf(error, "linkAdHistoryToRun");
    },
    async listAdHistory(businessId) {
      const { data, error } = await sb
        .from("ad_history")
        .select("*")
        .eq("business_id", businessId)
        .order("started_on", { ascending: false, nullsFirst: false })
        .limit(MAX_AD_HISTORY_READ);
      throwUnlessMissing(error, "listAdHistory");
      return (data ?? []) as AdHistory[];
    },
    async deleteAdHistory(businessId, opts) {
      let q = sb.from("ad_history").delete({ count: "exact" }).eq("business_id", businessId);
      if (opts?.source) q = q.eq("source", opts.source);
      const { count, error } = await q;
      throwIf(error, "deleteAdHistory");
      return count ?? 0;
    },

    async replaceWeekPicks(businessId, weekOf, picks) {
      // One call, one transaction: see replace_week_picks() in 0023_picks.sql.
      const { data, error } = await sb.rpc("replace_week_picks", {
        p_business_id: businessId,
        p_week_of: weekOf,
        p_picks: picks,
      });
      throwIf(error, "replaceWeekPicks");
      return ((data ?? []) as unknown[]).map((v) =>
        String(v !== null && typeof v === "object" ? Object.values(v as Record<string, unknown>)[0] : v),
      );
    },
    async listReadyPicks(businessId, weekOf) {
      const { data, error } = await sb
        .from("picks")
        .select("*")
        .eq("business_id", businessId)
        .eq("week_of", weekOf)
        .eq("status", "ready")
        .order("rank");
      throwUnlessMissing(error, "listReadyPicks");
      const picks = (data ?? []) as BrandPick[];
      if (picks.length === 0) return [];
      const ids = picks.map((p) => p.id);
      const [feedback, runs] = await Promise.all([
        sb.from("pick_feedback").select("pick_id").in("pick_id", ids).eq("action", "dismissed"),
        sb.from("pick_runs").select("*").in("pick_id", ids).order("started_at", { ascending: false }),
      ]);
      throwUnlessMissing(feedback.error, "listReadyPicks:feedback");
      throwUnlessMissing(runs.error, "listReadyPicks:runs");
      const dismissed = new Set(((feedback.data ?? []) as { pick_id: string }[]).map((r) => r.pick_id));
      const latest = new Map<string, PickRun>();
      for (const r of (runs.data ?? []) as PickRun[]) if (!latest.has(r.pick_id)) latest.set(r.pick_id, r);
      return picks.filter((p) => !dismissed.has(p.id)).map((pick) => ({ pick, run: latest.get(pick.id) ?? null }));
    },
    async countWeekPicks(businessId, weekOf) {
      const { count, error } = await sb
        .from("picks")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("week_of", weekOf);
      throwUnlessMissing(error, "countWeekPicks");
      return count ?? 0;
    },
    async getPickDetail(pickId) {
      const { data, error } = await sb.from("picks").select("*").eq("id", pickId).maybeSingle();
      throwUnlessMissing(error, "getPickDetail");
      if (!data) return null;
      const [evidence, scripts, runs, feedback] = await Promise.all([
        sb.from("pick_evidence").select("*").eq("pick_id", pickId).order("position"),
        sb.from("pick_scripts").select("*").eq("pick_id", pickId).order("position"),
        sb.from("pick_runs").select("*").eq("pick_id", pickId).order("started_at", { ascending: false }).limit(1),
        sb.from("pick_feedback").select("id").eq("pick_id", pickId).eq("action", "dismissed").limit(1),
      ]);
      throwIf(evidence.error, "getPickDetail:evidence");
      throwIf(scripts.error, "getPickDetail:scripts");
      throwUnlessMissing(runs.error, "getPickDetail:runs");
      throwUnlessMissing(feedback.error, "getPickDetail:feedback");
      return {
        pick: data as BrandPick,
        evidence: (evidence.data ?? []) as PickEvidence[],
        scripts: (scripts.data ?? []) as PickScript[],
        run: (((runs.data ?? []) as PickRun[])[0] ?? null),
        dismissed: (feedback.data ?? []).length > 0,
      };
    },
    async updatePickConcept(pickId, patch) {
      // The concept columns land with 0028; until then the refinement keeps
      // what it can (the finding, the guardrail) and drops the rest.
      const { data, error } = await writeTolerant(patch, (row) => sb.from("picks").update(row).eq("id", pickId).select().single(), "updatePickConcept");
      throwIf(error, "updatePickConcept");
      return data as BrandPick;
    },
    async createPickFeedback(input) {
      const { data, error } = await sb.from("pick_feedback").insert(input).select().single();
      throwIf(error, "createPickFeedback");
      return data as PickFeedback;
    },
    async createPickRun(input) {
      const { data, error } = await sb.from("pick_runs").insert(input).select().single();
      throwIf(error, "createPickRun");
      return data as PickRun;
    },
    async updatePickRun(id, patch) {
      // The verdict column lands with migration 0026; until it is pasted the
      // run still closes, without the owner's call.
      const { data, error } = await writeTolerant(patch, (row) => sb.from("pick_runs").update(row).eq("id", id).select().single(), "updatePickRun");
      throwIf(error, "updatePickRun");
      return data as PickRun;
    },
    async listPickRuns(businessId) {
      const { data, error } = await sb
        .from("pick_runs")
        .select("*")
        .eq("business_id", businessId)
        .order("started_at", { ascending: false });
      throwUnlessMissing(error, "listPickRuns");
      const runs = (data ?? []) as PickRun[];
      if (runs.length === 0) return [];
      const picks = await sb.from("picks").select("*").in("id", [...new Set(runs.map((r) => r.pick_id))]);
      throwUnlessMissing(picks.error, "listPickRuns:picks");
      const byId = new Map(((picks.data ?? []) as BrandPick[]).map((p) => [p.id, p]));
      return runs.filter((r) => byId.has(r.pick_id)).map((run) => ({ run, pick: byId.get(run.pick_id)! }));
    },
    async listPickFeedback(businessId) {
      const { data, error } = await sb
        .from("pick_feedback")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      throwUnlessMissing(error, "listPickFeedback");
      const rows = (data ?? []) as PickFeedback[];
      if (rows.length === 0) return [];
      const picks = await sb.from("picks").select("*").in("id", [...new Set(rows.map((r) => r.pick_id))]);
      throwUnlessMissing(picks.error, "listPickFeedback:picks");
      const byId = new Map(((picks.data ?? []) as BrandPick[]).map((p) => [p.id, p]));
      return rows.filter((r) => byId.has(r.pick_id)).map((feedback) => ({ feedback, pick: byId.get(feedback.pick_id)! }));
    },

    async replaceWeekSkips(businessId, weekOf, rows) {
      const del = await sb.from("week_skips").delete().eq("business_id", businessId).eq("week_of", weekOf);
      if (isMissingTable(del.error)) {
        console.warn("[supabase:replaceWeekSkips] week_skips missing — run migration 0026. Skips not kept.");
        return 0;
      }
      throwIf(del.error, "replaceWeekSkips:delete");
      if (rows.length === 0) return 0;
      const { count, error } = await sb.from("week_skips").upsert(
        rows.map((r) => ({ ...r, business_id: businessId, week_of: weekOf })),
        { onConflict: "business_id,week_of,normalized_term", count: "exact" },
      );
      throwIf(error, "replaceWeekSkips");
      return count ?? rows.length;
    },
    async listWeekSkips(businessId, weekOf) {
      const { data, error } = await sb.from("week_skips").select("*").eq("business_id", businessId).eq("week_of", weekOf);
      throwUnlessMissing(error, "listWeekSkips");
      return sortSkips((data ?? []) as WeekSkip[]);
    },

    async upsertSignalReadings(rows) {
      if (rows.length === 0) return 0;
      const { count, error } = await sb.from("signal_readings").upsert(
        rows.map((r) => ({ ...r, captured_on: r.captured_on ?? new Date().toISOString().slice(0, 10) })),
        { onConflict: "business_id,captured_on,signal,term", count: "exact" },
      );
      if (isMissingTable(error)) {
        console.warn("[supabase:upsertSignalReadings] signal_readings missing — run migration 0024. Baselines not kept.");
        return 0;
      }
      throwIf(error, "upsertSignalReadings");
      return count ?? 0;
    },
    async listSignalReadings(businessId, opts) {
      const since = new Date(Date.now() - (opts?.sinceDays ?? 90) * 86400_000).toISOString().slice(0, 10);
      let q = sb.from("signal_readings").select("*").eq("business_id", businessId).gte("captured_on", since);
      if (opts?.signal) q = q.eq("signal", opts.signal);
      if (opts?.term) q = q.eq("term", opts.term);
      const { data, error } = await q.order("captured_on", { ascending: true });
      throwUnlessMissing(error, "listSignalReadings");
      return (data ?? []) as SignalReading[];
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
    async insertPilotApplication(input) {
      // The insert policy allows the write; the select policy does not
      // return the row to an anonymous caller, so the id comes back only
      // for the service role. Callers treat a missing row as success.
      const { data, error } = await sb.from("pilot_applications").insert(input).select().maybeSingle();
      throwIf(error, "insertPilotApplication");
      return (data as PilotApplication | null) ?? { ...input, id: "", status: "new", created_at: new Date().toISOString() };
    },
  };
}
