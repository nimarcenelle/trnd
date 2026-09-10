import type {
  Alert,
  Business,
  BusinessBrief,
  Campaign,
  CampaignResult,
  Competitor,
  CompetitorRead,
  Connection,
  ConnectionProvider,
  Creative,
  DemoRequest,
  IntelNote,
  Learning,
  NewAlert,
  NewBusiness,
  NewBusinessBrief,
  NewCampaign,
  NewCampaignResult,
  NewCompetitor,
  NewCompetitorRead,
  NewConnection,
  NewCreative,
  NewDemoRequest,
  NewIntelNote,
  NewPickRead,
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
  Profile,
  Review,
  ReviewDigest,
  Service,
  Signal,
  SignalSeriesPoint,
  Subscription,
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
  /** Rewrite a draft campaign in place — same id (links and results keep
   * pointing at it), new angle and a fresh set of creatives. */
  replaceCampaign(
    id: string,
    patch: Pick<Campaign, "angle" | "hook" | "offer" | "audience" | "model_used" | "prompt_version">,
    creatives: Omit<NewCreative, "campaign_id">[],
  ): Promise<Campaign>;
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

  /* billing */
  getSubscription(businessId: string): Promise<Subscription | null>;
  /** Upsert on business_id — trial creation and webhook plan changes alike. */
  upsertSubscription(input: NewSubscription): Promise<Subscription>;
  /** Webhook lookups arrive keyed by Stripe's subscription id. Admin surface. */
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null>;
  /* intel notes — the analyst note opening each week's report */
  upsertIntelNote(input: NewIntelNote): Promise<IntelNote>;
  getIntelNote(businessId: string, weekOf: string): Promise<IntelNote | null>;

  /** The analyst's read on one pick — see PickRead. */
  upsertPickRead(input: NewPickRead): Promise<PickRead>;
  getPickRead(opportunityId: string): Promise<PickRead | null>;

  /* connections — OAuth links to ad platforms & business profiles */
  upsertConnection(input: NewConnection): Promise<Connection>;
  getConnection(businessId: string, provider: ConnectionProvider): Promise<Connection | null>;
  listConnections(businessId: string): Promise<Connection[]>;
  deleteConnection(businessId: string, provider: ConnectionProvider): Promise<void>;

  /* competitors — named rivals + dated observations */
  createCompetitor(input: NewCompetitor): Promise<Competitor>;
  listCompetitors(businessId: string): Promise<Competitor[]>;
  updateCompetitor(id: string, patch: Partial<NewCompetitor>): Promise<Competitor>;
  deleteCompetitor(id: string): Promise<void>;
  /** Idempotent per (competitor, kind, day). Returns rows written. */
  upsertCompetitorReads(inputs: NewCompetitorRead[]): Promise<number>;
  listCompetitorReads(businessId: string, opts?: { sinceDays?: number }): Promise<CompetitorRead[]>;

  /* reviews — own + competitor voice-of-customer */
  /** Dedupes on (business, competitor, author, text). Returns rows written. */
  upsertReviews(inputs: NewReview[]): Promise<number>;
  listReviews(businessId: string, opts?: { competitorId?: string | null }): Promise<Review[]>;
  upsertReviewDigest(input: NewReviewDigest): Promise<ReviewDigest>;
  getReviewDigest(businessId: string): Promise<ReviewDigest | null>;

  /* alerts — proactive nudges, deduped by key */
  /** No-ops on an existing dedupe_key. Returns the alert when newly created. */
  createAlert(input: NewAlert): Promise<Alert | null>;
  listAlerts(businessId: string, opts?: { unreadOnly?: boolean; limit?: number }): Promise<Alert[]>;
  markAlertsRead(businessId: string, ids?: string[]): Promise<void>;

  /* campaign platform linkage */
  setCampaignExternal(id: string, externalId: string, externalStatus: string): Promise<Campaign>;

  /* marketing */
  insertDemoRequest(input: NewDemoRequest): Promise<DemoRequest>;
}
