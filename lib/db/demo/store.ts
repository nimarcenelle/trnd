import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  AdHistory,
  Alert,
  Business,
  BusinessBrief,
  Campaign,
  CampaignResult,
  Competitor,
  CompetitorRead,
  Connection,
  Creative,
  DemoRequest,
  IntelNote,
  PickRead,
  StandingQuestion,
  BusinessDocument,
  Learning,
  Opportunity,
  Profile,
  Review,
  ReviewDigest,
  Service,
  Signal,
  SignalSeriesPoint,
  SocialPost,
  Subscription,
} from "../types";

/** A local account record — demo mode's stand-in for auth.users. */
export interface DemoUser {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string; // scrypt, hex
  salt: string;
  created_at: string;
}

export interface DemoStore {
  users: DemoUser[];
  profiles: Profile[];
  businesses: Business[];
  services: Service[];
  signals: Signal[];
  signal_series: SignalSeriesPoint[];
  opportunities: Opportunity[];
  campaigns: Campaign[];
  creatives: Creative[];
  campaign_results: CampaignResult[];
  learnings: Learning[];
  business_briefs: BusinessBrief[];
  subscriptions: Subscription[];
  intel_notes: IntelNote[];
  pick_reads?: PickRead[];
  standing_questions?: StandingQuestion[];
  business_documents?: BusinessDocument[];
  connections: Connection[];
  competitors: Competitor[];
  competitor_reads: CompetitorRead[];
  reviews: Review[];
  review_digests: ReviewDigest[];
  alerts: Alert[];
  demo_requests: DemoRequest[];
  social_posts?: SocialPost[];
  ad_history?: AdHistory[];
}

function emptyStore(): DemoStore {
  return {
    users: [],
    profiles: [],
    businesses: [],
    services: [],
    signals: [],
    signal_series: [],
    opportunities: [],
    campaigns: [],
    creatives: [],
    campaign_results: [],
    learnings: [],
    business_briefs: [],
    subscriptions: [],
    intel_notes: [],
    pick_reads: [],
    standing_questions: [],
    business_documents: [],
    connections: [],
    competitors: [],
    competitor_reads: [],
    reviews: [],
    review_digests: [],
    alerts: [],
    demo_requests: [],
  };
}

// Resolved lazily so tests can point TRND_DEMO_DIR at a temp dir even though
// ES-module imports hoist above their env assignment.
function dataDir(): string {
  return process.env.TRND_DEMO_DIR ?? path.join(process.cwd(), ".demo-data");
}
function dataFile(): string {
  return path.join(dataDir(), "store.json");
}

// Survive Next.js dev-server module reloads.
const g = globalThis as unknown as { __trndDemoStore?: DemoStore };

export function loadStore(): DemoStore {
  if (g.__trndDemoStore) return g.__trndDemoStore;
  let store = emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(dataFile(), "utf8")) as Partial<DemoStore>;
    store = { ...store, ...parsed };
  } catch {
    /* first run — start empty; the seed script fills it */
  }
  g.__trndDemoStore = store;
  return store;
}

export function saveStore(store?: DemoStore): void {
  const s = store ?? g.__trndDemoStore;
  if (!s) return;
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${dataFile()}.tmp`;
  writeFileSync(tmp, JSON.stringify(s));
  renameSync(tmp, dataFile());
}

/** Test/seed helper: replace the in-memory store wholesale. */
export function resetStore(next?: DemoStore): DemoStore {
  g.__trndDemoStore = next ?? emptyStore();
  return g.__trndDemoStore;
}

export const demoStorePath = dataFile;
