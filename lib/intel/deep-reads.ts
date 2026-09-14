import type { Repo } from "@/lib/db/repo";
import type { Business, Competitor, NewReview, NewSocialComment, Service, SocialPlatform, SocialPost } from "@/lib/db/types";
import { matchCatalog, shopifyCatalog, type CatalogProduct } from "@/lib/import/catalog";
import { competitiveSet } from "@/lib/recommend/four-signals";
import { fetchTrustpilotReviews, isTrustpilotAvailable } from "@/lib/reviews/trustpilot";
import { isOnlineBusiness } from "@/lib/signals/geo";
import { COMMENTS_PER_POST, fetchPostComments, postExternalId } from "@/lib/social/comments";
import { engagementOf } from "@/lib/social/read";

/**
 * The reads behind the words the four categories promised: what customers
 * write under the brand's and its rivals' posts, what they say about the
 * rivals in reviews, and whether the thing a pick would sell is in stock.
 * Each is a weekly (stock: daily) read with its own cap, run inside the
 * intel budget after the ads and the accounts. Every step tolerates
 * failure; a brand's read always completes with what it could get.
 */

/** A post's comments are read again after this long. */
export const COMMENT_REFRESH_DAYS = 7;
/** A company's Trustpilot page is read again after this long. */
export const REVIEW_REFRESH_DAYS = 7;
/** The brand's own posts whose comments are read: the ones its customers actually answered. */
export const OWN_POSTS_FOR_COMMENTS = 5;
/** Per rival. */
export const RIVAL_POSTS_FOR_COMMENTS = 2;
const COMMENT_PLATFORMS: SocialPlatform[] = ["instagram", "tiktok"];

const DAY_MS = 86400_000;

/** The posts worth reading comments under: most engaged first, with comments on them. */
export function postsForComments(posts: SocialPost[], max: number): SocialPost[] {
  return [...posts]
    .filter((p) => p.url && p.comments > 0)
    .sort((a, b) => engagementOf(b) - engagementOf(a) || b.comments - a.comments)
    .slice(0, max);
}

export async function ingestComments(
  repo: Repo,
  business: Business,
  competitors: Competitor[],
  opts: { deadline?: number } = {},
): Promise<{ written: number; exhausted: boolean }> {
  const deadline = opts.deadline ?? Infinity;
  let written = 0;
  let exhausted = false;
  const posts = await repo.listSocialPosts(business.id, { sinceDays: 120 }).catch(() => [] as SocialPost[]);
  const fresh = new Set(
    (await repo.listSocialComments(business.id, { sinceDays: COMMENT_REFRESH_DAYS }).catch(() => [])).map((c) => c.post_external_id),
  );
  const rivals = new Set(competitiveSet(competitors).map((c) => c.id));
  // Which posts to read, by platform, with whose they are.
  const byPlatform = new Map<SocialPlatform, { post: SocialPost; competitorId: string | null }[]>();
  const add = (platform: SocialPlatform, own: SocialPost[], rival: Map<string, SocialPost[]>) => {
    const list: { post: SocialPost; competitorId: string | null }[] = [];
    for (const p of postsForComments(own, OWN_POSTS_FOR_COMMENTS)) if (!fresh.has(p.external_id)) list.push({ post: p, competitorId: null });
    for (const [id, ps] of rival) {
      for (const p of postsForComments(ps, RIVAL_POSTS_FOR_COMMENTS)) if (!fresh.has(p.external_id)) list.push({ post: p, competitorId: id });
    }
    if (list.length > 0) byPlatform.set(platform, list);
  };
  for (const platform of COMMENT_PLATFORMS) {
    const own = posts.filter((p) => p.platform === platform && p.competitor_id === null);
    const rival = new Map<string, SocialPost[]>();
    for (const p of posts) {
      if (p.platform !== platform || !p.competitor_id || !rivals.has(p.competitor_id)) continue;
      rival.set(p.competitor_id, [...(rival.get(p.competitor_id) ?? []), p]);
    }
    add(platform, own, rival);
  }
  for (const [platform, list] of byPlatform) {
    if (Date.now() > deadline) {
      exhausted = true;
      break;
    }
    const whose = new Map(list.map((l) => [postExternalId(platform, l.post.url), l.competitorId]));
    const drafts = await fetchPostComments(
      platform,
      list.map((l) => l.post.url),
      { perPost: COMMENTS_PER_POST },
    );
    if (drafts.length === 0) continue;
    const rows: NewSocialComment[] = drafts.map((d) => ({
      ...d,
      business_id: business.id,
      competitor_id: whose.get(d.post_external_id) ?? null,
    }));
    try {
      written += await repo.upsertSocialComments(rows);
    } catch (err) {
      console.warn(`[intel:comments] ${platform} save failed (non-fatal):`, (err as Error).message);
    }
  }
  return { written, exhausted };
}

const domainOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Trustpilot for the brand and its direct rivals, once a week each. Only
 * online brands: a café's reviews are on its Google listing, and that read
 * already exists.
 */
export async function ingestTrustpilot(
  repo: Repo,
  business: Business,
  competitors: Competitor[],
  opts: { deadline?: number } = {},
): Promise<{ written: number; exhausted: boolean }> {
  if (!isOnlineBusiness(business) || !isTrustpilotAvailable()) return { written: 0, exhausted: false };
  const deadline = opts.deadline ?? Infinity;
  const existing = await repo.listReviews(business.id).catch(() => []);
  const floor = Date.now() - REVIEW_REFRESH_DAYS * DAY_MS;
  const readRecently = new Set(
    existing.filter((r) => r.source === "trustpilot" && Date.parse(r.captured_at) >= floor).map((r) => r.competitor_id ?? "own"),
  );
  const targets: { competitorId: string | null; domain: string }[] = [];
  const ownDomain = domainOf(business.website);
  if (ownDomain && !readRecently.has("own")) targets.push({ competitorId: null, domain: ownDomain });
  for (const c of competitiveSet(competitors)) {
    const domain = domainOf(c.website);
    if (domain && !readRecently.has(c.id)) targets.push({ competitorId: c.id, domain });
  }
  let written = 0;
  for (const t of targets) {
    if (Date.now() > deadline) return { written, exhausted: true };
    const reviews = await fetchTrustpilotReviews(t.domain);
    if (reviews.length === 0) continue;
    const rows: NewReview[] = reviews.map((r) => ({
      business_id: business.id,
      competitor_id: t.competitorId,
      author: r.author,
      rating: r.rating,
      text: r.text,
      published_at: r.publishedAt,
      source: "trustpilot",
    }));
    try {
      written += await repo.upsertReviews(rows);
    } catch (err) {
      console.warn(`[intel:trustpilot] ${t.domain} save failed (non-fatal):`, (err as Error).message);
    }
  }
  return { written, exhausted: false };
}

/** Pure: which services' stock changed, given the store's catalog. */
export function stockUpdates(services: Service[], catalog: CatalogProduct[], brand: string): { id: string; in_stock: boolean }[] {
  const out: { id: string; in_stock: boolean }[] = [];
  for (const s of services) {
    const match = matchCatalog(s.name, catalog, { brand });
    const stock = match?.product.inStock;
    if (typeof stock !== "boolean" || stock === s.in_stock) continue;
    out.push({ id: s.id, in_stock: stock });
  }
  return out;
}

async function fetchJsonWithin(url: string, ms: number): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; TRND/1.0)" }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/**
 * Stock from the store's public catalog, for the services the catalog
 * names. Shopify only for now: its products JSON carries availability per
 * variant. A store that blocks the read leaves every row as it was.
 */
export async function refreshStock(repo: Repo, business: Business, opts: { fetchJson?: (url: string) => Promise<unknown> } = {}): Promise<number> {
  if (!isOnlineBusiness(business) || !business.website) return 0;
  let origin: string;
  try {
    origin = new URL(/^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`).origin;
  } catch {
    return 0;
  }
  let catalog: CatalogProduct[];
  try {
    catalog = shopifyCatalog(await (opts.fetchJson ?? ((u: string) => fetchJsonWithin(u, 15_000)))(`${origin}/products.json?limit=250`));
  } catch {
    return 0;
  }
  if (catalog.length === 0 || catalog.every((p) => p.inStock === null)) return 0;
  const services = await repo.listServices(business.id).catch(() => [] as Service[]);
  const brand = `${new URL(origin).hostname.replace(/^www\./, "").split(".")[0]} ${business.name}`;
  let changed = 0;
  for (const u of stockUpdates(services, catalog, brand)) {
    try {
      await repo.updateService(u.id, { in_stock: u.in_stock });
      changed += 1;
    } catch (err) {
      console.warn(`[intel:stock] ${u.id} update failed (non-fatal):`, (err as Error).message);
    }
  }
  return changed;
}
