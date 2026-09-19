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
  AdHistory,
  AdAngle,
  AdFormat,
  HookType,
  NewAdHistory,
  BrandPick,
  NewPickBundle,
  NewPickFeedback,
  NewPickRun,
  NewWeekSkip,
  PickDetail,
  PickFeedback,
  PickRun,
  PickRunStatus,
  WeekSkip,
  SignalReading,
  NewSignalReading,
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
  Profile,
  Review,
  ReviewDigest,
  Service,
  Signal,
  SignalSeriesPoint,
  SocialPost,
  NewSocialPost,
  SocialPostKind,
  SocialComment,
  NewSocialComment,
  AiUsage,
  NewAiUsage,
  NewPilotApplication,
  NewProviderUsage,
  PilotApplication,
  ProviderUsage,
  Subscription,
  NewStrategyReadRow,
  StrategyReadRow,
} from "./types";

/**
 * The one data-access surface the app talks to. Two implementations:
 * lib/db/supabase (RLS-scoped or service-role) and lib/db/demo (local store
 * that enforces the same ownership rules RLS would).
 */
/** The most recent ad-history rows one read returns. A five-year Ads
 * Manager export for a busy account can hold thousands of rows; the reads
 * (best ads, usual CTR, themes) settle long before that. */
export const MAX_AD_HISTORY_READ = 500;

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
  /** The rows for these ids in one read (unknown ids are skipped, order
   * unspecified); for a page or report that holds many opportunities. */
  getSignalsByIds(ids: string[]): Promise<Signal[]>;
  upsertSeriesPoints(points: NewSeriesPoint[]): Promise<number>;
  getSeries(normalizedTerm: string, geo: string, days?: number): Promise<SignalSeriesPoint[]>;
  countSignalsCapturedOn(day: string, source?: string): Promise<number>;
  /** YouTube API policy: API data may be kept at most 30 days unless
   * refreshed. Blanks the numbers and payload on older YouTube signal rows
   * (the rows stay, so opportunities citing them survive) and drops series
   * points older than the window — every chart reads 30 days, and the series
   * table carries no source column to single YouTube out. */
  expireYoutubeData(maxAgeDays: number): Promise<{ signalsScrubbed: number; seriesDeleted: number }>;

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

  /** The week's account read (lib/research). Reads as null until migration 0031 is applied. */
  upsertStrategyRead(input: NewStrategyReadRow): Promise<StrategyReadRow | null>;
  getStrategyRead(businessId: string, weekOf: string): Promise<StrategyReadRow | null>;

  /** The analyst's read on one pick — see PickRead. */
  upsertPickRead(input: NewPickRead): Promise<PickRead>;
  getPickRead(opportunityId: string): Promise<PickRead | null>;

  /** The owner's uploaded knowledge — see BusinessDocument. */
  listDocuments(businessId: string): Promise<BusinessDocument[]>;
  createDocument(input: NewBusinessDocument): Promise<BusinessDocument>;
  deleteDocument(id: string): Promise<void>;

  /** Standing questions — answered every week; see StandingQuestion. */
  listStandingQuestions(businessId: string, opts?: { activeOnly?: boolean }): Promise<StandingQuestion[]>;
  createStandingQuestion(input: NewStandingQuestion): Promise<StandingQuestion>;
  setStandingQuestionActive(id: string, active: boolean): Promise<void>;
  answerStandingQuestion(
    id: string,
    patch: Pick<StandingQuestion, "answer" | "changed" | "answered_week" | "previous_answer" | "model_used">,
  ): Promise<StandingQuestion>;

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

  /* social posts — the business's own accounts and its rivals' */
  /** Dedupes on (business, competitor, platform, external_id); an existing
   * post has its engagement numbers refreshed. Returns rows written or updated. */
  upsertSocialPosts(inputs: NewSocialPost[]): Promise<number>;
  /** competitorId null = the business's own posts; undefined = everyone's. */
  listSocialPosts(
    businessId: string,
    opts?: { competitorId?: string | null; sinceDays?: number; platform?: SocialPost["platform"] },
  ): Promise<SocialPost[]>;
  setSocialPostKinds(kinds: { id: string; kind: SocialPostKind }[]): Promise<void>;

  /* social comments — what customers write under the brand's and its rivals' posts */
  /** Dedupes on (business, platform, external_id). Returns rows written. */
  upsertSocialComments(inputs: NewSocialComment[]): Promise<number>;
  /** competitorId null = under the business's own posts; undefined = everyone's. */
  listSocialComments(
    businessId: string,
    opts?: { competitorId?: string | null; sinceDays?: number },
  ): Promise<SocialComment[]>;

  /* ai usage — every model call's tokens */
  recordAiUsage(input: NewAiUsage): Promise<void>;
  listAiUsage(opts?: { sinceHours?: number; businessId?: string }): Promise<AiUsage[]>;

  /* provider usage — every paid call outside the model (0028) */
  recordProviderUsage(input: NewProviderUsage): Promise<void>;
  listProviderUsage(opts?: { sinceHours?: number; businessId?: string }): Promise<ProviderUsage[]>;

  /* pilot applications — the founder-assisted pilot's front door (0028) */
  insertPilotApplication(input: NewPilotApplication): Promise<PilotApplication>;

  /* ad history — the owner's own past ads and how they did */
  /** Dedupes on (business, platform, campaign, ad, start). Returns rows written. */
  upsertAdHistory(inputs: NewAdHistory[]): Promise<number>;
  /** Newest first, at most MAX_AD_HISTORY_READ rows. */
  listAdHistory(businessId: string): Promise<AdHistory[]>;
  deleteAdHistory(businessId: string, opts?: { source?: AdHistory["source"] }): Promise<number>;
  /** Points a history row at a creative test (or clears it). Reads as a
   * no-op before migration 0032. */
  linkAdHistoryToRun(adHistoryId: string, runId: string | null): Promise<void>;
  /** Writes each row's angle, kind of opening and format (lib/ads/classify.ts).
   * Reads as a no-op before migration 0033. */
  setAdHistoryClassification(rows: { id: string; angle: AdAngle; hook_type: HookType; format: AdFormat; classifier: string }[]): Promise<void>;

  /* picks — the week's ads, written whole by the weekly job */
  /** Replaces a week's picks (keeping any with a run or a dismissal) in one
   * transaction. A pick without three scripts and one evidence row is stored
   * as a draft whatever status it asked for. Returns the new pick ids. */
  replaceWeekPicks(businessId: string, weekOf: string, picks: NewPickBundle[]): Promise<string[]>;
  /** The week's ready picks by rank, dismissed ones left out, each with its
   * latest run. */
  listReadyPicks(businessId: string, weekOf: string): Promise<{ pick: BrandPick; run: PickRun | null }[]>;
  /** Picks of any status for a week, drafts included: the weekly job's
   * "already written" check, so a drafts-only week is not retried forever. */
  countWeekPicks(businessId: string, weekOf: string): Promise<number>;
  /** One pick with its evidence, scripts, latest run and dismissal state. */
  getPickDetail(pickId: string): Promise<PickDetail | null>;
  /** A refinement rewrites the concept in place; the id, the runs and the evidence stay. */
  updatePickConcept(
    pickId: string,
    patch: Partial<Pick<BrandPick, "concept_title" | "brief" | "brief_version" | "guardrail" | "priority_reason" | "finding" | "bet_what">>,
  ): Promise<BrandPick>;
  createPickFeedback(input: NewPickFeedback): Promise<PickFeedback>;
  createPickRun(input: NewPickRun): Promise<PickRun>;
  updatePickRun(
    id: string,
    patch: Partial<
      Pick<
        PickRun,
        | "status"
        | "ended_at"
        | "spend_usd"
        | "result_note"
        | "impressions"
        | "clicks"
        | "conversions"
        | "revenue_usd"
        | "verdict"
        | "launched_at"
        | "learned"
        | "baseline_ctr"
        | "lift"
        | "meta_campaign_id"
        | "fidelity_score"
        | "fidelity_read"
      >
    > & { status?: PickRunStatus },
  ): Promise<PickRun>;
  /** Newest first, every run this business ever opened, with its pick. */
  listPickRuns(businessId: string): Promise<{ run: PickRun; pick: BrandPick }[]>;
  /** Every dismissal and "running" mark for a business, newest first, with
   * the term it was on. The brand's memory of what it passed on. */
  listPickFeedback(businessId: string): Promise<{ feedback: PickFeedback; pick: BrandPick }[]>;

  /* week skips — what the ranking held this week, and why */
  /** Replaces the week's skips. Reads as a no-op before migration 0026. */
  replaceWeekSkips(businessId: string, weekOf: string, rows: NewWeekSkip[]): Promise<number>;
  /** The week's skips, strongest reason first (memory, fit, then hold by score). */
  listWeekSkips(businessId: string, weekOf: string): Promise<WeekSkip[]>;

  /* signal readings — the rolling baselines the four signals rank against */
  /** One reading per (business, day, signal, term); a same-day rerun replaces it. */
  upsertSignalReadings(rows: NewSignalReading[]): Promise<number>;
  listSignalReadings(
    businessId: string,
    opts?: { signal?: SignalReading["signal"]; term?: string; sinceDays?: number },
  ): Promise<SignalReading[]>;

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
