import { randomUUID } from "node:crypto";

import type { Repo } from "../repo";
import type {
  Business,
  Campaign,
  CampaignResult,
  Creative,
  Learning,
  NewBusiness,
  NewCampaign,
  NewCampaignResult,
  NewCreative,
  NewDemoRequest,
  NewLearning,
  NewOpportunity,
  NewSeriesPoint,
  NewService,
  NewSignal,
  Opportunity,
  OpportunityStatus,
  Service,
  Signal,
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
      const row: Business = { ...input, id: randomUUID(), created_at: nowIso() };
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
            (!opts?.geo || s.geo === opts.geo || s.geo === "US") &&
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

    /* ------------------------------ marketing ----------------------------- */
    async insertDemoRequest(input: NewDemoRequest) {
      const row = { ...input, id: randomUUID(), created_at: nowIso() };
      store.demo_requests.push(row);
      saveStore();
      return row;
    },
  };
}
