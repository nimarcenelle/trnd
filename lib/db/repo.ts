import type {
  Business,
  BusinessBrief,
  Campaign,
  CampaignResult,
  Creative,
  DemoRequest,
  Learning,
  NewBusiness,
  NewBusinessBrief,
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
  Profile,
  Service,
  Signal,
  SignalSeriesPoint,
} from "./types";

/**
 * The one data-access surface the app talks to. Two implementations:
 * lib/db/supabase (RLS-scoped or service-role) and lib/db/demo (local store
 * that enforces the same ownership rules RLS would).
 */
export interface Repo {
  /* profiles */
  getProfile(userId: string): Promise<Profile | null>;

  /* businesses */
  createBusiness(input: NewBusiness): Promise<Business>;
  getBusinessByOwner(ownerId: string): Promise<Business | null>;
  getBusiness(id: string): Promise<Business | null>;
  updateBusiness(id: string, patch: Partial<NewBusiness>): Promise<Business>;
  /** All businesses; admin/cron surface only. */
  listAllBusinesses(): Promise<Business[]>;

  /* services */
  createServices(inputs: NewService[]): Promise<Service[]>;
  listServices(businessId: string): Promise<Service[]>;
  updateService(id: string, patch: Partial<NewService>): Promise<Service>;
  deleteService(id: string): Promise<void>;

  /* signals — shared market data */
  upsertSignals(inputs: NewSignal[]): Promise<number>;
  listSignalsForCategory(category: string, opts?: { geo?: string; sinceDays?: number }): Promise<Signal[]>;
  getSignal(id: string): Promise<Signal | null>;
  upsertSeriesPoints(points: NewSeriesPoint[]): Promise<number>;
  getSeries(normalizedTerm: string, geo: string, days?: number): Promise<SignalSeriesPoint[]>;
  countSignalsCapturedOn(day: string, source?: string): Promise<number>;

  /* opportunities */
  upsertOpportunities(inputs: NewOpportunity[]): Promise<Opportunity[]>;
  listOpportunities(businessId: string, weekOf?: string): Promise<Opportunity[]>;
  /** Clears a week's ranking so it can be rebuilt; `keepIds` survive (rows a
   * campaign already references). Returns rows removed. */
  deleteOpportunitiesForWeek(businessId: string, weekOf: string, keepIds: string[]): Promise<number>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  setOpportunityStatus(id: string, status: OpportunityStatus): Promise<Opportunity>;

  /* campaigns + creatives */
  createCampaign(input: NewCampaign, creatives: Omit<NewCreative, "campaign_id">[]): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  getCampaignByOpportunity(opportunityId: string): Promise<Campaign | null>;
  listCampaigns(businessId: string): Promise<Campaign[]>;
  listCreatives(campaignId: string): Promise<Creative[]>;
  setCampaignStatus(id: string, status: Campaign["status"]): Promise<Campaign>;

  /* results + learnings */
  insertCampaignResult(input: NewCampaignResult): Promise<CampaignResult>;
  listResultsForBusiness(businessId: string): Promise<CampaignResult[]>;
  upsertLearning(input: NewLearning): Promise<Learning>;
  listLearnings(category: string, geoBucket?: string): Promise<Learning[]>;

  /* business briefs */
  upsertBusinessBrief(input: NewBusinessBrief): Promise<BusinessBrief>;
  getBusinessBrief(businessId: string): Promise<BusinessBrief | null>;

  /* marketing */
  insertDemoRequest(input: NewDemoRequest): Promise<DemoRequest>;
}
