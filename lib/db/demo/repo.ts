import { randomUUID } from "node:crypto";

import type { Repo } from "../repo";
import type {
  AdHistory,
  Alert,
  BrandPick,
  NewPickBundle,
  NewPickFeedback,
  NewPickRun,
  PickFeedback,
  PickRun,
  Business,
  BusinessBrief,
  Campaign,
  CampaignResult,
  Competitor,
  Connection,
  Creative,
  IntelNote,
  Learning,
  NewAdHistory,
  NewAlert,
  NewBusiness,
  NewSocialPost,
  SocialPostKind,
  NewCampaign,
  NewBusinessBrief,
  NewCampaignResult,
  NewCompetitor,
  NewCompetitorRead,
  NewConnection,
  NewDemoRequest,
  NewIntelNote,
  NewPickRead,
  NewStandingQuestion,
  NewBusinessDocument,
  BusinessDocument,
  NewLearning,
  NewOpportunity,
  NewReview,
  NewReviewDigest,
  NewSeriesPoint,
  NewService,
  NewSignal,
  NewSubscription,
  Opportunity,
  OpportunityStatus,
  PickRead,
  StandingQuestion,
  ReviewDigest,
  Service,
  Signal,
  Subscription,
} from "../types";
import { loadStore, saveStore } from "./store";

/**
 * Who is asking. Mirrors what RLS derives from the JWT: a user reaches rows
 * only through a business they own; `admin` stands in for the service role.
 */
export type DemoActor = { kind: "user"; userId: string } | { kind: "admin" };

function nowIso() {
  return new Date().toISOString();
}

class OwnershipError extends Error {
  constructor(what: string) {
    super(`demo-mode ownership check failed (would be blocked by RLS): ${what}`);
  }
}

export function createDemoRepo(actor: DemoActor): Repo {
  const store = loadStore();

  function assertOwnsBusiness(businessId: string): Business {
    const b = store.businesses.find((x) => x.id === businessId);
    if (!b) throw new OwnershipError(`business ${businessId} not found`);
    if (actor.kind === "user" && b.owner_id !== actor.userId) {
      throw new OwnershipError(`business ${businessId}`);
    }
    return b;
  }

  function visibleBusinessIds(): Set<string> {
    if (actor.kind === "admin") return new Set(store.businesses.map((b) => b.id));
    return new Set(
      store.businesses.filter((b) => b.owner_id === actor.userId).map((b) => b.id),
    );
  }

  function campaignOrThrow(id: string): Campaign {
    const c = store.campaigns.find((x) => x.id === id);
    if (!c) throw new OwnershipError(`campaign ${id} not found`);
    assertOwnsBusiness(c.business_id);
    return c;
  }

  return {
    /* ------------------------------ profiles ------------------------------ */
    async getProfile(userId) {
      if (actor.kind === "user" && actor.userId !== userId) return null;
      return store.profiles.find((p) => p.id === userId) ?? null;
    },

    /* ----------------------------- businesses ----------------------------- */
    async createBusiness(input: NewBusiness) {
      if (actor.kind === "user" && input.owner_id !== actor.userId) {
        throw new OwnershipError("createBusiness for another owner");
      }
      const row: Business = {
        ...input,
        social_handles: input.social_handles ?? {},
        market: input.market ?? "local",
        monthly_ad_spend: input.monthly_ad_spend ?? null,
        ad_platforms: input.ad_platforms ?? [],
        id: randomUUID(),
        created_at: nowIso(),
      };
      store.businesses.push(row);
      saveStore();
      return row;
    },
    async getBusinessByOwner(ownerId) {
      if (actor.kind === "user" && actor.userId !== ownerId) return null;
      return store.businesses.find((b) => b.owner_id === ownerId) ?? null;
    },
    async getBusiness(id) {
      const b = store.businesses.find((x) => x.id === id) ?? null;
      if (!b) return null;
      if (actor.kind === "user" && b.owner_id !== actor.userId) return null;
      return b;
    },
    async updateBusiness(id, patch) {
      const b = assertOwnsBusiness(id);
      Object.assign(b, patch);
      saveStore();
      return b;
    },
    async listAllBusinesses() {
      if (actor.kind !== "admin") {
        return store.businesses.filter((b) => b.owner_id === (actor as { userId: string }).userId);
      }
      return [...store.businesses];
    },

    /* ------------------------------ services ------------------------------ */
    async createServices(inputs: NewService[]) {
      const rows: Service[] = inputs.map((i) => {
        assertOwnsBusiness(i.business_id);
        return { ...i, id: randomUUID() };
      });
      store.services.push(...rows);
      saveStore();
      return rows;
    },
    async listServices(businessId) {
      const ids = visibleBusinessIds();
      if (!ids.has(businessId)) return [];
      return store.services.filter((s) => s.business_id === businessId);
    },
    async updateService(id, patch) {
      const s = store.services.find((x) => x.id === id);
      if (!s) throw new OwnershipError(`service ${id} not found`);
      assertOwnsBusiness(s.business_id);
      Object.assign(s, patch);
      saveStore();
      return s;
    },
    async deleteService(id) {
      const s = store.services.find((x) => x.id === id);
      if (!s) return;
      assertOwnsBusiness(s.business_id);
      store.services = store.services.filter((x) => x.id !== id);
      saveStore();
    },

    /* ------------------------------- signals ------------------------------ */
    async upsertSignals(inputs: NewSignal[]) {
      let written = 0;
      for (const i of inputs) {
        const captured = i.captured_at ?? nowIso();
        const day = captured.slice(0, 10);
        const exists = store.signals.some(
          (s) =>
            s.source === i.source &&
            s.normalized_term === i.normalized_term &&
            s.geo === i.geo &&
            s.captured_at.slice(0, 10) === day,
        );
        if (exists) continue;
        const row: Signal = { ...i, id: randomUUID(), captured_at: captured };
        store.signals.push(row);
        written += 1;
      }
      if (written) saveStore();
      return written;
    },
    async listSignalsForCategory(category, opts) {
      const sinceDays = opts?.sinceDays ?? 14;
      const cutoff = Date.now() - sinceDays * 86400_000;
      return store.signals
        .filter(
          (s) =>
            s.category === category &&
            // National rows, the business's state, and any metro inside it
            // ("US-GA-524" for a "US-GA" query) rank together.
            (!opts?.geo ||
              s.geo === "US" ||
              s.geo === opts.geo ||
              s.geo.startsWith(`${opts.geo}-`)) &&
            new Date(s.captured_at).getTime() >= cutoff,
        )
        .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0));
    },
    async getSignal(id) {
      return store.signals.find((s) => s.id === id) ?? null;
    },
    async upsertSeriesPoints(points: NewSeriesPoint[]) {
      let written = 0;
      for (const p of points) {
        const existing = store.signal_series.find(
          (x) => x.normalized_term === p.normalized_term && x.geo === p.geo && x.day === p.day,
        );
        if (existing) {
          existing.value = p.value;
        } else {
          store.signal_series.push({ ...p, id: randomUUID() });
          written += 1;
        }
      }
      saveStore();
      return written;
    },
    async getSeries(normalizedTerm, geo, days = 30) {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      return store.signal_series
        .filter((x) => x.normalized_term === normalizedTerm && x.geo === geo && x.day >= cutoff)
        .sort((a, b) => a.day.localeCompare(b.day));
    },
    async expireYoutubeData(maxAgeDays: number) {
      const cutoff = new Date(Date.now() - maxAgeDays * 86400_000);
      let signalsScrubbed = 0;
      for (const s of store.signals) {
        if (s.source !== "youtube" || new Date(s.captured_at) >= cutoff) continue;
        if (s.raw === null && s.value === null) continue;
        s.value = null;
        s.delta_pct = null;
        s.raw = null;
        signalsScrubbed += 1;
      }
      const day = cutoff.toISOString().slice(0, 10);
      const before = store.signal_series.length;
      store.signal_series = store.signal_series.filter((x) => x.day >= day);
      const seriesDeleted = before - store.signal_series.length;
      if (signalsScrubbed || seriesDeleted) saveStore();
      return { signalsScrubbed, seriesDeleted };
    },
    async countSignalsCapturedOn(day, source) {
      return store.signals.filter(
        (s) => s.captured_at.slice(0, 10) === day && (!source || s.source === source),
      ).length;
    },

    /* ---------------------------- opportunities --------------------------- */
    async upsertOpportunities(inputs: NewOpportunity[]) {
      const out: Opportunity[] = [];
      for (const i of inputs) {
        assertOwnsBusiness(i.business_id);
        const existing = store.opportunities.find(
          (o) =>
            o.business_id === i.business_id &&
            o.signal_id === i.signal_id &&
            o.week_of === i.week_of,
        );
        if (existing) {
          existing.score = i.score;
          existing.rationale = i.rationale;
          existing.matched_service_id = i.matched_service_id;
          existing.competitor_gap = i.competitor_gap;
          existing.relevance = i.relevance;
          out.push(existing);
          continue;
        }
        const row: Opportunity = {
          ...i,
          status: i.status ?? "new",
          id: randomUUID(),
          created_at: nowIso(),
        };
        store.opportunities.push(row);
        out.push(row);
      }
      saveStore();
      return out;
    },
    async listOpportunities(businessId, weekOf) {
      const ids = visibleBusinessIds();
      if (!ids.has(businessId)) return [];
      return store.opportunities
        .filter((o) => o.business_id === businessId && (!weekOf || o.week_of === weekOf))
        .sort((a, b) => b.score - a.score);
    },
    async deleteOpportunitiesForWeek(businessId, weekOf, keepIds) {
      assertOwnsBusiness(businessId);
      const keep = new Set(keepIds);
      const before = store.opportunities.length;
      store.opportunities = store.opportunities.filter(
        (o) => o.business_id !== businessId || o.week_of !== weekOf || keep.has(o.id),
      );
      saveStore();
      return before - store.opportunities.length;
    },
    async getOpportunity(id) {
      const o = store.opportunities.find((x) => x.id === id) ?? null;
      if (!o) return null;
      if (!visibleBusinessIds().has(o.business_id)) return null;
      return o;
    },
    async setOpportunityStatus(id, status: OpportunityStatus) {
      const o = store.opportunities.find((x) => x.id === id);
      if (!o) throw new OwnershipError(`opportunity ${id} not found`);
      assertOwnsBusiness(o.business_id);
      o.status = status;
      saveStore();
      return o;
    },

    /* --------------------------- campaigns et al -------------------------- */
    async createCampaign(input: NewCampaign, creatives) {
      assertOwnsBusiness(input.business_id);
      const campaign: Campaign = {
        ...input,
        status: input.status ?? "draft",
        external_id: input.external_id ?? null,
        external_status: input.external_status ?? null,
        id: randomUUID(),
        created_at: nowIso(),
      };
      store.campaigns.push(campaign);
      const rows: Creative[] = creatives.map((c) => ({
        ...c,
        campaign_id: campaign.id,
        id: randomUUID(),
      }));
      store.creatives.push(...rows);
      saveStore();
      return campaign;
    },
    async getCampaign(id) {
      const c = store.campaigns.find((x) => x.id === id) ?? null;
      if (!c) return null;
      if (!visibleBusinessIds().has(c.business_id)) return null;
      return c;
    },
    async getCampaignByOpportunity(opportunityId) {
      const c = store.campaigns.find((x) => x.opportunity_id === opportunityId) ?? null;
      if (!c) return null;
      if (!visibleBusinessIds().has(c.business_id)) return null;
      return c;
    },
    async replaceCampaign(id, patch, creatives) {
      const c = store.campaigns.find((x) => x.id === id);
      if (!c) throw new OwnershipError(`campaign ${id} not found`);
      assertOwnsBusiness(c.business_id);
      Object.assign(c, patch);
      store.creatives = store.creatives.filter((cr) => cr.campaign_id !== id);
      store.creatives.push(
        ...creatives.map((cr) => ({ ...cr, campaign_id: id, id: randomUUID() })),
      );
      saveStore();
      return c;
    },
    async listCampaigns(businessId) {
      const ids = visibleBusinessIds();
      if (!ids.has(businessId)) return [];
      return store.campaigns
        .filter((c) => c.business_id === businessId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async listCreatives(campaignId) {
      const c = store.campaigns.find((x) => x.id === campaignId);
      if (!c || !visibleBusinessIds().has(c.business_id)) return [];
      return store.creatives
        .filter((x) => x.campaign_id === campaignId)
        .sort((a, b) => a.variant_index - b.variant_index);
    },
    async setCampaignStatus(id, status) {
      const c = campaignOrThrow(id);
      c.status = status;
      saveStore();
      return c;
    },

    /* --------------------------- results/learnings ------------------------ */
    async insertCampaignResult(input: NewCampaignResult) {
      campaignOrThrow(input.campaign_id);
      const row: CampaignResult = { ...input, id: randomUUID(), recorded_at: nowIso() };
      store.campaign_results.push(row);
      saveStore();
      return row;
    },
    async listResultsForBusiness(businessId) {
      const ids = visibleBusinessIds();
      if (!ids.has(businessId)) return [];
      const campaignIds = new Set(
        store.campaigns.filter((c) => c.business_id === businessId).map((c) => c.id),
      );
      return store.campaign_results
        .filter((r) => campaignIds.has(r.campaign_id))
        .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    },
    async upsertLearning(input: NewLearning) {
      const existing = store.learnings.find(
        (l) =>
          l.category === input.category &&
          l.geo_bucket === input.geo_bucket &&
          l.angle_type === input.angle_type,
      );
      if (existing) {
        existing.lift = input.lift;
        existing.sample_size = input.sample_size;
        // A measured result replaces a sample prior, source included.
        existing.source = input.source;
        existing.updated_at = nowIso();
        saveStore();
        return existing;
      }
      const row: Learning = { ...input, id: randomUUID(), updated_at: nowIso() };
      store.learnings.push(row);
      saveStore();
      return row;
    },
    async listLearnings(category, geoBucket) {
      return store.learnings.filter(
        (l) => l.category === category && (!geoBucket || l.geo_bucket === geoBucket),
      );
    },

    /* --------------------------- business briefs --------------------------- */
    async upsertBusinessBrief(input: NewBusinessBrief) {
      assertOwnsBusiness(input.business_id);
      const existing = store.business_briefs.find((b) => b.business_id === input.business_id);
      if (existing) {
        Object.assign(existing, input);
        saveStore();
        return existing;
      }
      const row: BusinessBrief = {
        ...input,
        target_customer: input.target_customer ?? null,
        id: randomUUID(),
        created_at: nowIso(),
      };
      store.business_briefs.push(row);
      saveStore();
      return row;
    },
    async getBusinessBrief(businessId) {
      if (!visibleBusinessIds().has(businessId)) return null;
      // Older stores predate this table.
      return (store.business_briefs ?? []).find((b) => b.business_id === businessId) ?? null;
    },

    /* ------------------------------- billing ------------------------------ */
    async getSubscription(businessId) {
      if (!visibleBusinessIds().has(businessId)) return null;
      return (store.subscriptions ?? []).find((s) => s.business_id === businessId) ?? null;
    },
    async upsertSubscription(input: NewSubscription) {
      assertOwnsBusiness(input.business_id);
      store.subscriptions ??= [];
      const existing = store.subscriptions.find((s) => s.business_id === input.business_id);
      if (existing) {
        Object.assign(existing, input, { updated_at: nowIso() });
        saveStore();
        return existing;
      }
      const row: Subscription = {
        ...input,
        id: randomUUID(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      store.subscriptions.push(row);
      saveStore();
      return row;
    },
    async getSubscriptionByStripeId(stripeSubscriptionId) {
      const s =
        (store.subscriptions ?? []).find(
          (x) => x.stripe_subscription_id === stripeSubscriptionId,
        ) ?? null;
      if (!s) return null;
      if (!visibleBusinessIds().has(s.business_id)) return null;
      return s;
    },

    /* ------------------------------ intel notes ---------------------------- */
    async upsertIntelNote(input: NewIntelNote) {
      assertOwnsBusiness(input.business_id);
      store.intel_notes ??= [];
      const existing = store.intel_notes.find(
        (n) => n.business_id === input.business_id && n.week_of === input.week_of,
      );
      if (existing) {
        Object.assign(existing, input);
        saveStore();
        return existing;
      }
      const row: IntelNote = { ...input, id: randomUUID(), created_at: nowIso() };
      store.intel_notes.push(row);
      saveStore();
      return row;
    },
    async upsertPickRead(input: NewPickRead) {
      assertOwnsBusiness(input.business_id);
      store.pick_reads ??= [];
      const existing = store.pick_reads.find((r) => r.opportunity_id === input.opportunity_id);
      if (existing) {
        Object.assign(existing, input, { created_at: nowIso() });
        saveStore();
        return existing;
      }
      const row: PickRead = { ...input, id: randomUUID(), created_at: nowIso() };
      store.pick_reads.push(row);
      saveStore();
      return row;
    },
    async getPickRead(opportunityId) {
      const r = (store.pick_reads ?? []).find((x) => x.opportunity_id === opportunityId) ?? null;
      if (!r) return null;
      if (!visibleBusinessIds().has(r.business_id)) return null;
      return r;
    },
    async listDocuments(businessId) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.business_documents ?? [])
        .filter((d) => d.business_id === businessId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async createDocument(input: NewBusinessDocument) {
      assertOwnsBusiness(input.business_id);
      store.business_documents ??= [];
      const row: BusinessDocument = { ...input, id: randomUUID(), created_at: nowIso() };
      store.business_documents.push(row);
      saveStore();
      return row;
    },
    async deleteDocument(id) {
      const d = (store.business_documents ?? []).find((x) => x.id === id);
      if (!d) throw new OwnershipError(`document ${id} not found`);
      assertOwnsBusiness(d.business_id);
      store.business_documents = (store.business_documents ?? []).filter((x) => x.id !== id);
      saveStore();
    },
    async listStandingQuestions(businessId, opts) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.standing_questions ?? [])
        .filter((q) => q.business_id === businessId && (!opts?.activeOnly || q.active))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async createStandingQuestion(input: NewStandingQuestion) {
      assertOwnsBusiness(input.business_id);
      store.standing_questions ??= [];
      const row: StandingQuestion = {
        ...input,
        id: randomUUID(),
        active: true,
        answer: [],
        changed: null,
        answered_week: null,
        previous_answer: [],
        model_used: null,
        created_at: nowIso(),
      };
      store.standing_questions.push(row);
      saveStore();
      return row;
    },
    async setStandingQuestionActive(id, active) {
      const q = (store.standing_questions ?? []).find((x) => x.id === id);
      if (!q) throw new OwnershipError(`standing question ${id} not found`);
      assertOwnsBusiness(q.business_id);
      q.active = active;
      saveStore();
    },
    async answerStandingQuestion(id, patch) {
      const q = (store.standing_questions ?? []).find((x) => x.id === id);
      if (!q) throw new OwnershipError(`standing question ${id} not found`);
      assertOwnsBusiness(q.business_id);
      Object.assign(q, patch);
      saveStore();
      return q;
    },
    async getIntelNote(businessId, weekOf) {
      if (!visibleBusinessIds().has(businessId)) return null;
      return (
        (store.intel_notes ?? []).find(
          (n) => n.business_id === businessId && n.week_of === weekOf,
        ) ?? null
      );
    },

    /* ------------------------------ connections --------------------------- */
    async upsertConnection(input: NewConnection) {
      assertOwnsBusiness(input.business_id);
      store.connections ??= [];
      const existing = store.connections.find(
        (c) => c.business_id === input.business_id && c.provider === input.provider,
      );
      if (existing) {
        Object.assign(existing, input, { updated_at: nowIso() });
        saveStore();
        return existing;
      }
      const row: Connection = { ...input, id: randomUUID(), created_at: nowIso(), updated_at: nowIso() };
      store.connections.push(row);
      saveStore();
      return row;
    },
    async getConnection(businessId, provider) {
      if (!visibleBusinessIds().has(businessId)) return null;
      return (
        (store.connections ?? []).find(
          (c) => c.business_id === businessId && c.provider === provider,
        ) ?? null
      );
    },
    async listConnections(businessId) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.connections ?? []).filter((c) => c.business_id === businessId);
    },
    async deleteConnection(businessId, provider) {
      assertOwnsBusiness(businessId);
      store.connections = (store.connections ?? []).filter(
        (c) => !(c.business_id === businessId && c.provider === provider),
      );
      saveStore();
    },

    /* ------------------------------ competitors --------------------------- */
    async createCompetitor(input: NewCompetitor) {
      assertOwnsBusiness(input.business_id);
      store.competitors ??= [];
      const dupe = store.competitors.find(
        (c) => c.business_id === input.business_id && c.name.toLowerCase() === input.name.toLowerCase(),
      );
      if (dupe) return dupe;
      const row: Competitor = {
        ...input,
        social_handles: input.social_handles ?? {},
        directness: input.directness ?? null,
        directness_reason: input.directness_reason ?? null,
        id: randomUUID(),
        created_at: nowIso(),
      };
      store.competitors.push(row);
      saveStore();
      return row;
    },
    async listCompetitors(businessId) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.competitors ?? []).filter((c) => c.business_id === businessId);
    },
    async updateCompetitor(id, patch) {
      const row = (store.competitors ?? []).find((c) => c.id === id);
      if (!row) throw new OwnershipError(`competitor ${id} not found`);
      assertOwnsBusiness(row.business_id);
      Object.assign(row, patch);
      saveStore();
      return row;
    },
    async deleteCompetitor(id) {
      const row = (store.competitors ?? []).find((c) => c.id === id);
      if (!row) return;
      assertOwnsBusiness(row.business_id);
      store.competitors = store.competitors.filter((c) => c.id !== id);
      store.competitor_reads = (store.competitor_reads ?? []).filter((r) => r.competitor_id !== id);
      store.social_posts = (store.social_posts ?? []).filter((p) => p.competitor_id !== id);
      saveStore();
    },
    async upsertCompetitorReads(inputs: NewCompetitorRead[]) {
      store.competitor_reads ??= [];
      let written = 0;
      for (const i of inputs) {
        assertOwnsBusiness(i.business_id);
        const captured = i.captured_at ?? nowIso();
        const day = captured.slice(0, 10);
        const exists = store.competitor_reads.some(
          (r) =>
            r.competitor_id === i.competitor_id &&
            r.kind === i.kind &&
            r.captured_at.slice(0, 10) === day,
        );
        if (exists) continue;
        store.competitor_reads.push({ ...i, id: randomUUID(), captured_at: captured });
        written += 1;
      }
      if (written) saveStore();
      return written;
    },
    async listCompetitorReads(businessId, opts) {
      if (!visibleBusinessIds().has(businessId)) return [];
      const cutoff = Date.now() - (opts?.sinceDays ?? 30) * 86400_000;
      return (store.competitor_reads ?? [])
        .filter((r) => r.business_id === businessId && new Date(r.captured_at).getTime() >= cutoff)
        .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
    },

    /* -------------------------------- reviews ----------------------------- */
    async upsertReviews(inputs: NewReview[]) {
      store.reviews ??= [];
      let written = 0;
      for (const i of inputs) {
        assertOwnsBusiness(i.business_id);
        const exists = store.reviews.some(
          (r) =>
            r.business_id === i.business_id &&
            (r.competitor_id ?? null) === (i.competitor_id ?? null) &&
            r.author === i.author &&
            r.text === i.text,
        );
        if (exists) continue;
        store.reviews.push({ ...i, id: randomUUID(), captured_at: nowIso() });
        written += 1;
      }
      if (written) saveStore();
      return written;
    },
    async listReviews(businessId, opts) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.reviews ?? [])
        .filter(
          (r) =>
            r.business_id === businessId &&
            (opts?.competitorId === undefined || (r.competitor_id ?? null) === opts.competitorId),
        )
        .sort((a, b) => (b.published_at ?? b.captured_at).localeCompare(a.published_at ?? a.captured_at));
    },
    async upsertReviewDigest(input: NewReviewDigest) {
      assertOwnsBusiness(input.business_id);
      store.review_digests ??= [];
      const existing = store.review_digests.find((d) => d.business_id === input.business_id);
      if (existing) {
        Object.assign(existing, input, { created_at: nowIso() });
        saveStore();
        return existing;
      }
      const row: ReviewDigest = { ...input, id: randomUUID(), created_at: nowIso() };
      store.review_digests.push(row);
      saveStore();
      return row;
    },
    async getReviewDigest(businessId) {
      if (!visibleBusinessIds().has(businessId)) return null;
      return (store.review_digests ?? []).find((d) => d.business_id === businessId) ?? null;
    },

    /* ----------------------------- social posts --------------------------- */
    async upsertSocialPosts(inputs: NewSocialPost[]) {
      store.social_posts ??= [];
      let written = 0;
      for (const i of inputs) {
        assertOwnsBusiness(i.business_id);
        const existing = store.social_posts.find(
          (p) =>
            p.business_id === i.business_id &&
            (p.competitor_id ?? null) === (i.competitor_id ?? null) &&
            p.platform === i.platform &&
            p.external_id === i.external_id,
        );
        if (existing) {
          // Engagement keeps climbing after capture — refresh the numbers,
          // keep the classification.
          Object.assign(existing, {
            likes: i.likes,
            comments: i.comments,
            shares: i.shares,
            views: i.views,
            is_ad: i.is_ad,
            kind: i.kind ?? existing.kind,
            captured_at: nowIso(),
          });
        } else {
          store.social_posts.push({ ...i, id: randomUUID(), captured_at: nowIso() });
        }
        written += 1;
      }
      if (written) saveStore();
      return written;
    },
    async listSocialPosts(businessId, opts) {
      if (!visibleBusinessIds().has(businessId)) return [];
      const cutoff = Date.now() - (opts?.sinceDays ?? 90) * 86400_000;
      return (store.social_posts ?? [])
        .filter(
          (p) =>
            p.business_id === businessId &&
            (opts?.competitorId === undefined || (p.competitor_id ?? null) === opts.competitorId) &&
            (!opts?.platform || p.platform === opts.platform) &&
            new Date(p.posted_at ?? p.captured_at).getTime() >= cutoff,
        )
        .sort((a, b) => (b.posted_at ?? b.captured_at).localeCompare(a.posted_at ?? a.captured_at));
    },
    async setSocialPostKinds(kinds) {
      const byId = new Map(kinds.map((k) => [k.id, k.kind]));
      for (const p of store.social_posts ?? []) {
        const kind = byId.get(p.id);
        if (kind) p.kind = kind;
      }
      if (kinds.length) saveStore();
    },

    /* ------------------------------ ad history ---------------------------- */
    async upsertAdHistory(inputs: NewAdHistory[]) {
      store.ad_history ??= [];
      let written = 0;
      for (const i of inputs) {
        assertOwnsBusiness(i.business_id);
        const exists = store.ad_history.some(
          (r) =>
            r.business_id === i.business_id &&
            r.platform === i.platform &&
            r.campaign_name === i.campaign_name &&
            (r.ad_name ?? null) === (i.ad_name ?? null) &&
            (r.started_on ?? null) === (i.started_on ?? null),
        );
        if (exists) continue;
        store.ad_history.push({ ...i, id: randomUUID(), created_at: nowIso() });
        written += 1;
      }
      if (written) saveStore();
      return written;
    },
    async listAdHistory(businessId) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.ad_history ?? [])
        .filter((r) => r.business_id === businessId)
        .sort((a, b) => (b.started_on ?? "").localeCompare(a.started_on ?? ""));
    },
    async deleteAdHistory(businessId, opts) {
      assertOwnsBusiness(businessId);
      const before = (store.ad_history ?? []).length;
      store.ad_history = (store.ad_history ?? []).filter(
        (r) => !(r.business_id === businessId && (!opts?.source || r.source === opts.source)),
      );
      const removed = before - store.ad_history.length;
      if (removed) saveStore();
      return removed;
    },

    /* -------------------------------- picks --------------------------------- */
    async replaceWeekPicks(businessId: string, weekOf: string, bundles: NewPickBundle[]) {
      assertOwnsBusiness(businessId);
      store.picks ??= [];
      store.pick_evidence ??= [];
      store.pick_scripts ??= [];
      store.pick_feedback ??= [];
      store.pick_runs ??= [];
      // Same rule as replace_week_picks(): a pick someone acted on stays.
      const acted = new Set([...store.pick_runs.map((r) => r.pick_id), ...store.pick_feedback.map((f) => f.pick_id)]);
      const removed = new Set(
        store.picks.filter((p) => p.business_id === businessId && p.week_of === weekOf && !acted.has(p.id)).map((p) => p.id),
      );
      store.picks = store.picks.filter((p) => !removed.has(p.id));
      store.pick_evidence = store.pick_evidence.filter((e) => !removed.has(e.pick_id));
      store.pick_scripts = store.pick_scripts.filter((sc) => !removed.has(sc.pick_id));
      const ids: string[] = [];
      for (const bundle of bundles) {
        const id = randomUUID();
        const ready = bundle.scripts.length >= 3 && bundle.evidence.length >= 1;
        const row: BrandPick = {
          ...bundle.pick,
          id,
          business_id: businessId,
          week_of: weekOf,
          status: ready ? bundle.pick.status : "draft",
          created_at: nowIso(),
        };
        store.picks.push(row);
        bundle.evidence.forEach((e, i) => store.pick_evidence!.push({ ...e, id: randomUUID(), pick_id: id, position: i }));
        bundle.scripts.forEach((sc, i) => store.pick_scripts!.push({ ...sc, id: randomUUID(), pick_id: id, position: i }));
        ids.push(id);
      }
      saveStore();
      return ids;
    },
    async listReadyPicks(businessId, weekOf) {
      if (!visibleBusinessIds().has(businessId)) return [];
      const dismissed = new Set((store.pick_feedback ?? []).filter((f) => f.action === "dismissed").map((f) => f.pick_id));
      return (store.picks ?? [])
        .filter((p) => p.business_id === businessId && p.week_of === weekOf && p.status === "ready" && !dismissed.has(p.id))
        .sort((a, b) => a.rank - b.rank)
        .map((pick) => ({
          pick,
          run:
            [...(store.pick_runs ?? [])]
              .filter((r) => r.pick_id === pick.id)
              .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null,
        }));
    },
    async getPickDetail(pickId) {
      const pick = (store.picks ?? []).find((p) => p.id === pickId);
      if (!pick || !visibleBusinessIds().has(pick.business_id)) return null;
      return {
        pick,
        evidence: (store.pick_evidence ?? []).filter((e) => e.pick_id === pickId).sort((a, b) => a.position - b.position),
        scripts: (store.pick_scripts ?? []).filter((sc) => sc.pick_id === pickId).sort((a, b) => a.position - b.position),
        run:
          [...(store.pick_runs ?? [])]
            .filter((r) => r.pick_id === pickId)
            .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null,
        dismissed: (store.pick_feedback ?? []).some((f) => f.pick_id === pickId && f.action === "dismissed"),
      };
    },
    async createPickFeedback(input: NewPickFeedback) {
      assertOwnsBusiness(input.business_id);
      store.pick_feedback ??= [];
      const row: PickFeedback = { ...input, id: randomUUID(), created_at: nowIso() };
      store.pick_feedback.push(row);
      saveStore();
      return row;
    },
    async createPickRun(input: NewPickRun) {
      assertOwnsBusiness(input.business_id);
      store.pick_runs ??= [];
      const row: PickRun = {
        ...input,
        id: randomUUID(),
        started_at: input.started_at ?? nowIso(),
        ended_at: input.ended_at ?? null,
        spend_usd: input.spend_usd ?? null,
        result_note: input.result_note ?? null,
        meta_campaign_id: input.meta_campaign_id ?? null,
      };
      store.pick_runs.push(row);
      saveStore();
      return row;
    },
    async updatePickRun(id, patch) {
      const row = (store.pick_runs ?? []).find((r) => r.id === id);
      if (!row) throw new OwnershipError(`pick run ${id} not found`);
      assertOwnsBusiness(row.business_id);
      Object.assign(row, patch);
      saveStore();
      return row;
    },
    async listPickRuns(businessId) {
      if (!visibleBusinessIds().has(businessId)) return [];
      const picks = new Map((store.picks ?? []).map((p) => [p.id, p]));
      return (store.pick_runs ?? [])
        .filter((r) => r.business_id === businessId && picks.has(r.pick_id))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .map((run) => ({ run, pick: picks.get(run.pick_id)! }));
    },

    /* -------------------------------- alerts ------------------------------ */
    async createAlert(input: NewAlert) {
      assertOwnsBusiness(input.business_id);
      store.alerts ??= [];
      const exists = store.alerts.some(
        (a) => a.business_id === input.business_id && a.dedupe_key === input.dedupe_key,
      );
      if (exists) return null;
      const row: Alert = { ...input, id: randomUUID(), read_at: null, created_at: nowIso() };
      store.alerts.push(row);
      saveStore();
      return row;
    },
    async listAlerts(businessId, opts) {
      if (!visibleBusinessIds().has(businessId)) return [];
      return (store.alerts ?? [])
        .filter((a) => a.business_id === businessId && (!opts?.unreadOnly || a.read_at === null))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, opts?.limit ?? 50);
    },
    async markAlertsRead(businessId, ids) {
      assertOwnsBusiness(businessId);
      for (const a of store.alerts ?? []) {
        if (a.business_id === businessId && a.read_at === null && (!ids || ids.includes(a.id))) {
          a.read_at = nowIso();
        }
      }
      saveStore();
    },

    /* ------------------------ campaign platform link ----------------------- */
    async setCampaignExternal(id, externalId, externalStatus) {
      const c = campaignOrThrow(id);
      c.external_id = externalId;
      c.external_status = externalStatus;
      saveStore();
      return c;
    },

    /* ------------------------------ marketing ----------------------------- */
    async insertDemoRequest(input: NewDemoRequest) {
      const row = { ...input, id: randomUUID(), created_at: nowIso() };
      store.demo_requests.push(row);
      saveStore();
      return row;
    },
  };
}
