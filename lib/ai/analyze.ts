import "server-only";

import { z } from "zod";

import { MAX_RIVALS } from "@/lib/db/types";
import type { Ad, Brand, BrandProfile, EmailKind, Landscape, Objectives, Opportunity, OwnAdResult, ReportBody, Rival, RivalEmail, SiteChange, SocialProfile } from "@/lib/db/types";
import { rankResults } from "@/lib/results";
import { topHooks, topicsByScore } from "@/lib/score";
import { standing } from "@/lib/standing";

import { adStage, daysRunning, PROVEN_DAYS, SCALING_DAYS, SCALING_VERSIONS, TESTING_DAYS } from "@/lib/diff";

import { generateJson } from "./openai";

/**
 * The three things the model does: read a brand's site (who it is and who it
 * competes with), tag every ad with its angle, and write the report a scan
 * ends with, comparing the brand with its market on paid and organic social.
 */

const SYSTEM = `You are TRND, a paid-social strategist who watches a brand's competitors' Meta ads and social accounts for them.
You are concrete and specific. You name the rival and quote the ad. You never invent numbers: the Ad Library shows
no spend, impressions or results for commercial ads, so "still running after N days" and "N variants" are the
strongest evidence you have. Say "still running after 60 days", never "their best performer". You also read their websites and
the marketing emails they send subscribers. What a competitor intends is inferred from public signals, never known: say
"looks like", "suggests", and match your confidence to the evidence.
Write for a busy founder: short sentences, everyday words. No strategy jargon ("lane", "claim territory", "value
argument", "positioning play"). One idea per sentence.`;

/* ------------------------------ site → rivals ----------------------------- */

const TIER = z.enum(["budget", "mid", "premium", "unknown"]);

export const ProfileSchema = z.object({
  what_it_sells: z.string(),
  price_point: z.string(),
  price_tier: TIER,
  audience: z.string(),
  value_props: z.array(z.string()),
  proof_points: z.array(z.string()),
  offers: z.array(z.string()),
  tone: z.string(),
  differentiators: z.array(z.string()),
});

const DiscoverySchema = z.object({
  name: z.string(),
  summary: z.string(),
  category: z.string(),
  profile: ProfileSchema,
  rivals: z.array(z.object({ name: z.string(), website: z.string(), reason: z.string() })),
});
export type Discovery = z.infer<typeof DiscoverySchema>;

export async function discoverRivals(url: string, siteText: string): Promise<Discovery> {
  return generateJson({
    system: SYSTEM,
    schema: DiscoverySchema,
    prompt: `Here is the text of ${url}.

<site>
${siteText}
</site>

Return:
- name: the brand's name as customers know it.
- summary: two sentences on what it sells, at what price point, to whom.
- category: a short label for the market it competes in (e.g. "premium dog food", "shower filters").
- profile, all from what the site says (write "unknown" or leave a list empty rather than guess):
  - what_it_sells: the products in one line.
  - price_point: the typical price as the site shows it (e.g. "$79 filter, $25 refills").
  - price_tier: budget, mid or premium for this category.
  - audience: who it is for, specifically.
  - value_props: the 3-5 main promises it makes.
  - proof_points: the evidence it offers (reviews count, press, certifications, guarantees).
  - offers: current discounts, bundles, subscriptions or shipping offers.
  - tone: how it talks, in a few words.
  - differentiators: what it claims makes it different from alternatives.
- rivals: the ${MAX_RIVALS} most influential direct competitors for the same customer, most influential first.
  Influence means how much of this customer's attention and spend a brand commands: market share, brand recognition,
  how heavily it advertises on Meta, and its social following. Leading brands in the category belong here even when
  bigger than this one. Leave out marketplaces and general retailers (no Amazon, Walmart, Target) and brands that
  only overlap a little. For each: the brand name exactly as it appears on its Facebook Page, its website domain
  (e.g. "brand.com"), and one line on why it competes for the same customer.`,
  });
}

/* --------------------------- find a rival's Page -------------------------- */

const PageHuntSchema = z.object({
  /** The candidate that is the company, by its id, or "" when none is. */
  page_id: z.string(),
  why: z.string(),
  /** Facebook Page handles or URLs the company probably uses. */
  facebook_pages: z.array(z.string()),
  /** Other names to search the Ad Library for. */
  search_terms: z.array(z.string()),
});
export type PageHunt = z.infer<typeof PageHuntSchema>;

export interface PageCandidateLine {
  pageId: string;
  pageName: string;
  pageUrl: string | null;
  samples: { body: string | null; title: string | null; link: string | null }[];
}

/**
 * When the Ad Library search does not plainly show the company's Page: pick
 * it out of the advertisers the searches turned up, or say what else to try
 * (the Page's handle, the name it advertises under, a sub-brand).
 */
export async function huntPage(
  company: { name: string; website: string | null; category?: string | null },
  candidates: PageCandidateLine[],
  tried: string[],
): Promise<PageHunt> {
  const list = candidates.length
    ? candidates
        .map((c) =>
          [
            `[${c.pageId}] ${c.pageName}${c.pageUrl ? ` (${c.pageUrl})` : ""}`,
            ...c.samples.map((a) => `   - ${[a.title, (a.body ?? "").slice(0, 200).replace(/\s+/g, " "), a.link ? `→ ${a.link}` : ""].filter(Boolean).join(" · ")}`),
          ].join("\n"),
        )
        .join("\n")
    : "(none: the searches found no advertisers)";
  return generateJson({
    system: SYSTEM,
    schema: PageHuntSchema,
    effort: "low",
    prompt: `We need the Facebook Page that ${company.name}${company.website ? ` (${company.website})` : ""}${company.category ? `, a ${company.category} brand,` : ""} runs its Meta ads from.
Ad Library searches already tried: ${tried.map((t) => `"${t}"`).join(", ") || "none"}.

Advertisers those searches found, with a few of their ads:
${list}

Return:
- page_id: the id of the candidate that is ${company.name} itself (its own brand Page, not a reseller, reviewer, affiliate,
  marketplace or a different company with a similar name), exactly as shown in brackets. Judge by the Page name, the
  Page address, the products and the sites the ads link to. "" when no candidate is clearly theirs.
- why: one line.
- facebook_pages: if page_id is "", up to 3 Facebook Page handles or facebook.com URLs ${company.name} most likely uses,
  most likely first (e.g. "brandofficial"). Only ones you have reason to believe exist. Else [].
- search_terms: if page_id is "", up to 3 other names to search the Ad Library for: the name the Page advertises under,
  the parent company, the flagship product, the domain without ".com". None already tried. Else [].`,
  });
}

/* ------------------------------- tag the ads ------------------------------ */

const TagSchema = z.object({
  ads: z.array(z.object({ id: z.string(), angle: z.string(), hook: z.string(), offer: z.string(), topic: z.string() })),
});

export interface AdTag {
  id: string;
  angle: string;
  hook: string;
  offer: string;
  topic: string;
}

/** Angle, hook, offer and topic for each ad, in one call per batch. */
export async function tagAds(ads: Pick<Ad, "id" | "body" | "title" | "cta" | "format">[]): Promise<AdTag[]> {
  if (!ads.length) return [];
  const lines = ads
    .map((a) => `[${a.id}] ${a.format} · ${a.title ?? ""} · ${(a.body ?? "").slice(0, 400).replace(/\s+/g, " ")} · CTA: ${a.cta ?? "-"}`)
    .join("\n");
  const { ads: tags } = await generateJson({
    system: SYSTEM,
    schema: TagSchema,
    effort: "low",
    prompt: `Tag each ad below. Return one entry per ad, with its id exactly as given.
- angle: the persuasion angle in 2-4 words (e.g. "problem/solution", "founder story", "social proof", "us vs them", "ingredient education", "price anchor", "UGC testimonial").
- hook: the opening line or idea that stops the scroll, 15 words max.
- offer: the offer or incentive (e.g. "20% off first order", "free shipping", "bundle"), or "none".
- topic: what the ad is about, the subject not the tactic, in 1-4 lowercase words, reusing the same wording for the
  same subject across ads (e.g. "hair breakage", "hard water", "eczema", "filter refills", "bathroom design").

${lines}`,
  });
  return tags;
}

/* ---------------------------- comment sentiment ---------------------------- */

const SentimentSchema = z.object({ items: z.array(z.object({ id: z.string(), sentiment: z.number().min(-1).max(1) })) });

/** How commenters feel about each ad's organic post: -1 (negative) to 1 (positive). */
export async function commentSentiment(items: { id: string; comments: string[] }[]): Promise<{ id: string; sentiment: number }[]> {
  if (!items.length) return [];
  const lines = items.map((i) => `[${i.id}]\n${i.comments.slice(0, 8).map((c) => `  - ${c.replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}`).join("\n");
  const { items: out } = await generateJson({
    system: SYSTEM,
    schema: SentimentSchema,
    effort: "low",
    prompt: `For each post below, read its comments and score how people feel about the product or offer: -1 (complaints,
scam accusations, bad experiences), 0 (neutral, questions, tags of friends), 1 (praise, purchase intent, "need this").
Return one entry per post, with its id exactly as given.

${lines}`,
  });
  return out;
}

/* ------------------------------ tag the emails ----------------------------- */

const EMAIL_KINDS = ["promo", "launch", "newsletter", "content", "retention", "announcement", "confirmation", "other"] as const satisfies readonly EmailKind[];

const EmailTagSchema = z.object({
  emails: z.array(z.object({ id: z.string(), kind: z.enum(EMAIL_KINDS), offer: z.string(), theme: z.string(), is_repeat: z.boolean() })),
});

export interface EmailTag {
  id: string;
  kind: EmailKind;
  offer: string;
  theme: string;
  is_repeat: boolean;
}

/**
 * Kind, offer and theme for each competitor email, and whether it repeats
 * something they already sent (the same offer or message again) or is new.
 */
export async function tagEmails(
  emails: (Pick<RivalEmail, "id" | "subject" | "preview"> & { rival: string; earlier: string[] })[],
): Promise<EmailTag[]> {
  if (!emails.length) return [];
  const lines = emails
    .map((e) => `[${e.id}] ${e.rival} · "${e.subject}" · ${(e.preview ?? "").slice(0, 300).replace(/\s+/g, " ")}${e.earlier.length ? `\n   their earlier subjects: ${e.earlier.slice(0, 8).map((x) => `"${x}"`).join(", ")}` : ""}`)
    .join("\n");
  const { emails: tags } = await generateJson({
    system: SYSTEM,
    schema: EmailTagSchema,
    effort: "low",
    prompt: `Tag each competitor marketing email below. Return one entry per email, with its id exactly as given.
- kind: promo (a discount or sale), launch (a new product or collection), newsletter, content (education, stories), retention
  (win-back, replenishment, loyalty), announcement (news, policy, events), confirmation (a signup confirmation or welcome), other.
- offer: the offer or incentive in 2-8 words (e.g. "25% off sitewide", "free gift over $60", "bundle and save"), or "none".
- theme: what the email is about in 2-6 words (e.g. "summer skin routine", "new travel size", "hard water education").
- is_repeat: true when it repeats an offer or message from their earlier subjects; false when it is a new push.

${lines}`,
  });
  return tags;
}

/* -------------------------------- the report ------------------------------ */

const LandscapeSchema = z.object({
  summary: z.string(),
  positions: z.array(z.object({ name: z.string(), price_tier: TIER, audience: z.string(), message: z.string(), strength: z.string() })),
  you_vs_them: z.object({ only_you: z.array(z.string()), only_them: z.array(z.string()), open_lanes: z.array(z.string()) }),
});

const LEVEL = z.enum(["high", "medium", "low"]);
const score = z.number().int().min(1).max(5);

const OpportunitySchema = z.object({
  type: z.enum(["get_ahead", "win_choice", "counter", "ignore"]),
  title: z.string(),
  punch: z.string(),
  competitors: z.array(z.string()),
  signal: z.string(),
  intent: z.string(),
  fit: z.string(),
  urgency: LEVEL,
  confidence: LEVEL,
  scores: z.object({ relevance: score, urgency: score, differentiation: score, feasibility: score, confidence: score }),
  recommendation: z.string(),
  brief: z.object({
    angle: z.string(),
    hook: z.string(),
    offer: z.string(),
    creative: z.string(),
    format: z.string(),
    audience: z.string(),
    experiment: z.string(),
  }),
  evidence: z.array(z.string()),
});

const ReportSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  insights: z.array(z.object({ title: z.string(), line: z.string(), detail: z.string(), status: z.enum(["new", "ongoing", "repeated"]), evidence: z.array(z.string()) })),
  opportunities: z.array(OpportunitySchema),
  rivals: z.array(z.object({ name: z.string(), strategy: z.string(), watch_for: z.string() })),
  landscape: LandscapeSchema,
});

export interface SocialLine {
  name: string;
  profile: Pick<SocialProfile, "platform" | "handle" | "followers" | "posts_per_week" | "engagement_rate" | "recent">;
  growth: { from: number; to: number; days: number } | null;
}

export interface ReportInput {
  brand: Pick<Brand, "name" | "url" | "summary" | "category"> & { profile?: BrandProfile | null; objectives?: Objectives | null };
  /** The brand's own results from its Ads Manager export. */
  results?: Pick<OwnAdResult, "ad_name" | "body" | "spend" | "ctr" | "results" | "result_type" | "cost_per_result" | "roas">[];
  /** The brand's own active Meta ads. */
  own?: Ad[];
  /** Why the brand's own ads weren't read, when they weren't: never to be reported as "runs no ads". */
  ownUnread?: string | null;
  /** `unread`: why this company's ads couldn't be read this time. */
  rivals: (Pick<Rival, "name"> & { ads: Ad[]; unread?: string | null })[];
  social?: SocialLine[];
  /** Material website changes, recent first. `fresh`: found since the last report. */
  site?: (SiteChange & { rival: string; fresh: boolean })[];
  /** Competitor marketing emails, recent first. `fresh`: received since the last report. */
  emails?: (Pick<RivalEmail, "id" | "subject" | "preview" | "received_at" | "kind" | "offer" | "theme" | "is_repeat"> & { rival: string; fresh: boolean })[];
  changes: { launched: Ad[]; stopped: Ad[]; proven: Ad[] } | null;
  today: string;
}

/** Short refs for the prompt (S1, E1), mapped back to "site:<id>" and "email:<id>" in the report. */
function refsOf(input: ReportInput) {
  const site = new Map((input.site ?? []).map((c, i) => [`S${i + 1}`, c]));
  const emails = new Map((input.emails ?? []).map((e, i) => [`E${i + 1}`, e]));
  return { site, emails };
}

function siteBlock(site: Map<string, NonNullable<ReportInput["site"]>[number]>): string {
  return [...site]
    .map(([ref, c]) => `[${ref}] ${c.detected_at.slice(0, 10)} · ${c.rival} · ${c.title}${c.before || c.after ? ` (${c.before ?? "–"} → ${c.after ?? "–"})` : ""}${c.fresh ? " · NEW" : ""}`)
    .join("\n");
}

function emailBlock(emails: Map<string, NonNullable<ReportInput["emails"]>[number]>): string {
  return [...emails]
    .map(
      ([ref, e]) =>
        `[${ref}] ${e.received_at.slice(0, 10)} · ${e.rival} · ${e.kind ?? "email"}${e.offer && e.offer !== "none" ? ` · offer: ${e.offer}` : ""}${e.theme ? ` · theme: ${e.theme}` : ""}${
          e.is_repeat ? " · repeat" : e.is_repeat === false ? " · new push" : ""
        } · "${e.subject}" · ${(e.preview ?? "").slice(0, 160).replace(/\s+/g, " ")}${e.fresh ? " · NEW" : ""}`,
    )
    .join("\n");
}

function adLine(ad: Ad, today: string): string {
  const days = daysRunning(ad, today);
  const parts = [
    `[${ad.archive_id}]`,
    ad.score !== null && ad.score !== undefined ? `score ${ad.score}` : null,
    days === null ? "start unknown" : `${days}d running`,
    adStage(ad, today),
    ad.format,
    ad.variants > 1 ? `${ad.variants} variants` : null,
    ad.angle ? `angle: ${ad.angle}` : null,
    ad.offer && ad.offer !== "none" ? `offer: ${ad.offer}` : null,
    `"${(ad.title ? `${ad.title} — ` : "") + (ad.body ?? "").slice(0, 280).replace(/\s+/g, " ")}"`,
    ad.cta ? `CTA ${ad.cta}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function profileBlock(p: BrandProfile): string {
  const list = (xs: string[]) => (xs.length ? xs.join("; ") : "unknown");
  return `What it sells: ${p.what_it_sells}. Price: ${p.price_point} (${p.price_tier}). Audience: ${p.audience}.
Promises: ${list(p.value_props)}. Proof: ${list(p.proof_points)}. Offers: ${list(p.offers)}.
Tone: ${p.tone}. Claims to be different because: ${list(p.differentiators)}.`;
}

const GOAL: Record<Objectives["goal"], string> = {
  new_customers: "win new customers",
  subscriptions: "grow subscriptions",
  launch: "launch a new product",
  retention: "bring past customers back",
  awareness: "build awareness",
};

function objectivesBlock(o: Objectives): string {
  return `Right now the brand wants to ${GOAL[o.goal]}.${o.focus ? ` Focus: ${o.focus}.` : ""}${o.monthly_budget ? ` Monthly ad budget: ${o.monthly_budget}.` : ""}${
    o.target_cost ? ` Target cost per result: ${o.target_cost}.` : ""
  }${o.notes ? ` Notes: ${o.notes}` : ""}`;
}

function resultsBlock(rows: NonNullable<ReportInput["results"]>): string {
  const { best, worst } = rankResults(rows);
  const line = (r: (typeof rows)[number]) =>
    `- "${r.ad_name}"${r.body ? ` ("${r.body.slice(0, 120).replace(/\s+/g, " ")}")` : ""}: spent ${r.spend ?? "?"}, ${r.results ?? "?"} ${r.result_type ?? "results"} at ${
      r.cost_per_result ?? "?"
    } each${r.ctr !== null ? `, CTR ${r.ctr}%` : ""}${r.roas !== null ? `, ROAS ${r.roas}` : ""}`;
  return `Best by cost per result:\n${best.map(line).join("\n") || "none with enough spend"}\nWorst:\n${worst.map(line).join("\n") || "none"}`;
}

function socialBlock(lines: SocialLine[]): string {
  return lines
    .map(({ name, profile: s, growth }) => {
      const top = [...s.recent].sort((a, b) => (b.likes ?? 0) + (b.views ?? 0) / 20 - ((a.likes ?? 0) + (a.views ?? 0) / 20)).slice(0, 3);
      const g = growth && growth.days > 0 ? `, ${growth.to - growth.from >= 0 ? "+" : ""}${growth.to - growth.from} followers in ${growth.days}d` : "";
      return `- ${name} on ${s.platform} (@${s.handle}): ${s.followers ?? "?"} followers${g}, ${s.posts_per_week ?? "?"} posts/week, engagement ${
        s.engagement_rate !== null ? `${(s.engagement_rate * 100).toFixed(2)}%` : "?"
      }. Top recent: ${top.map((p) => `"${(p.caption ?? "").slice(0, 90).replace(/\s+/g, " ")}" (${p.likes ?? 0} likes${p.views ? `, ${p.views} views` : ""})`).join("; ") || "none"}`;
    })
    .join("\n");
}

export function reportPrompt(input: ReportInput): string {
  const { brand, rivals, changes, today } = input;
  const own = (input.own ?? []).filter((a) => a.active).sort((a, b) => (daysRunning(b, today) ?? 0) - (daysRunning(a, today) ?? 0));
  const ownBlock = input.ownUnread && !own.length
    ? `\n\n# ${brand.name}'s own Meta ads: NOT READ (${input.ownUnread}). We don't know what ${brand.name} runs. Never say it runs no ads or has no presence on Meta; leave its own ads out of the comparison.`
    : `\n\n# ${brand.name}'s own active Meta ads (${own.length})\n${own.slice(0, 20).map((a) => adLine(a, today)).join("\n") || "(none running: say so, and what that costs them)"}`;
  const social = input.social?.length ? `\n\n# Organic social (Instagram and TikTok)\n${socialBlock(input.social)}` : "";
  const results = input.results?.length ? `\n\n# ${brand.name}'s own past ad results (from its Ads Manager)\n${resultsBlock(input.results)}` : "";
  const rivalBlocks = rivals
    .map((r) => {
      const active = r.ads.filter((a) => a.active);
      const sorted = [...active].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (daysRunning(b, today) ?? 0) - (daysRunning(a, today) ?? 0));
      if (r.unread && !active.length) return `## ${r.name}: ads NOT READ (${r.unread}). Unknown, not zero: draw no conclusions about their ads.`;
      return `## ${r.name}: ${active.length} active ads\n${sorted.slice(0, 25).map((a) => adLine(a, today)).join("\n") || "(no active ads)"}`;
    })
    .join("\n\n");
  const changeBlock = changes
    ? `\n\n# What changed since the last scan
Launched (${changes.launched.length}):
${changes.launched.map((a) => adLine(a, today)).join("\n") || "none"}
Stopped (${changes.stopped.length}):
${changes.stopped.map((a) => adLine(a, today)).join("\n") || "none"}
Crossed ${PROVEN_DAYS} days still running (${changes.proven.length}):
${changes.proven.map((a) => adLine(a, today)).join("\n") || "none"}`
    : "";

  const { site, emails } = refsOf(input);
  const scored = rivals.flatMap((r) => r.ads.filter((a) => a.active && a.score !== null && a.score !== undefined).map((a) => ({ ...a, rival: r.name })));
  const byScore = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const ranking = byScore.length >= 4
    ? `\n\n# Conversion ranking: what is working for them (read this first)
Each competitor ad has a conversion score, 0-100: a heuristic blending how long it has run, its reach rank, how many
versions are running, and (when the ad also runs as an organic post) that post's likes, comments, shares and comment
sentiment against the company's usual post. Highest first:
${byScore.slice(0, 10).map((a) => `- ${a.score} · ${a.rival} · [${a.archive_id}]${a.topic ? ` · topic: ${a.topic}` : ""}${a.hook ? ` · hook: "${a.hook}"` : ""}${a.engagement ? ` · organic post: ${a.engagement.likes ?? 0} likes, ${a.engagement.comments ?? 0} comments, ${a.engagement.shares ?? 0} shares` : ""}`).join("\n")}
Lowest:
${byScore.slice(-5).reverse().map((a) => `- ${a.score} · ${a.rival} · [${a.archive_id}]${a.topic ? ` · topic: ${a.topic}` : ""}${a.hook ? ` · hook: "${a.hook}"` : ""}`).join("\n")}

Topics that appear most among what works (weighted by score):
${topicsByScore(scored).map((t) => `- ${t.topic}: ${t.ads} ads, average score ${t.avgScore}`).join("\n") || "(not tagged yet)"}

Hooks of the highest-scoring ads:
${topHooks(scored).map((a) => `- "${a.hook}" (${a.rival}, ${a.score})`).join("\n")}`
    : "";
  const stand = standing({
    companies: [{ id: "you", name: brand.name, you: true }, ...rivals.map((r) => ({ id: `r:${r.name}`, name: r.name, you: false }))],
    ads: [...(input.own ?? []).map((a) => ({ ...a, rival_id: "you" })), ...rivals.flatMap((r) => r.ads.map((a) => ({ ...a, rival_id: `r:${r.name}` })))],
  });
  const standingText =
    ranking && stand.you
      ? `\n\n# Where ${brand.name} stands on the conversion score
Brands by the average score of their 5 best live ads:
${stand.brands.map((b) => `- ${b.rank ? `#${b.rank}` : "unranked"} ${b.name}${b.you ? " (you)" : ""}: ${b.strength ?? "no scored ads"}${b.best ? ` · best ad ${b.best.score}${b.best.hook ? ` "${b.best.hook}"` : ""}` : ""}`).join("\n")}
${brand.name}'s best ad ranks ${stand.bestAdRank ? `#${stand.bestAdRank} of ${stand.totalAds}` : "nowhere (no scored live ads)"} ads in the market.
Topics that score for competitors: ${stand.topics.map((t) => `${t.topic} (${t.avgScore}, ${t.yours ? "you run it" : "you don't"})`).join("; ") || "none yet"}.`
      : "";
  const siteText = site.size ? `\n\n# Competitor website changes (homepage, catalog, prices, promotions)\n${siteBlock(site)}` : "";
  const emailText = emails.size ? `\n\n# Competitor marketing emails (sent to subscribers)\n${emailBlock(emails)}` : "";
  const fresh = Boolean(changes) || [...site.values()].some((c) => c.fresh) || [...emails.values()].some((e) => e.fresh);

  return `Today is ${today}. The brand: ${brand.name} (${brand.url}), ${brand.category ?? ""}. ${brand.summary ?? ""}
${brand.profile ? profileBlock(brand.profile) : ""}
${brand.objectives ? objectivesBlock(brand.objectives) : ""}

Three signal streams on its competitors follow: their active Meta ads (where they fight for attention), their websites
(what they sell and how), and their marketing emails (what they push to customers directly). Every line starts with a
ref: an ad's archive id, S# for a website change, E# for an email. Lines marked NEW arrived since the last report.

${ranking ? `${ranking}${standingText}\n\n` : ""}# Active Meta ads, highest score first
Each ad is marked testing (under ${TESTING_DAYS} days), scaling (past ${TESTING_DAYS} days with ${SCALING_VERSIONS}+ versions, or past ${SCALING_DAYS} days), or running.
${rivalBlocks}${siteText}${emailText}${ownBlock}${results}${social}${changeBlock}

Write the report the brand's founder reads.${ranking ? ` Start from the conversion ranking: the topics and hooks of the highest-scoring ads
are what works in this market, so they shape the opportunities and every brief (borrow the topic and the shape of the
hook, in ${brand.name}'s voice); the lowest-scoring patterns are what to avoid.` : ""} The value is in connecting signals: a new value-focused homepage, a
discounted email bundle and several savings-themed ads together suggest a coordinated affordability push, not three
unrelated events. Read everything through ${brand.name}'s business: what it sells, to whom, its strengths, its economics
and its goal.
- headline: ONE story, at most 18 words: the single competitor move that matters most${fresh ? " in what changed" : ""} and
  what ${brand.name} should do about it. Name one competitor, not two. Never join two different fights with "while" or "and".
  e.g. "AquaBliss is selling hard on price. Answer with proof of results, not a discount."
- summary: 2-3 short sentences, under 60 words, that explain the headline: what they did and why it matters to
  ${brand.name}. Leave every other move to the insights and opportunities.
The report is read as a feed: every item is one punchy line first, with the detail a tap away. Fewer, sharper items.
- insights: 3-4 patterns the brand would not otherwise know, grouping related signals across channels. title: at most
  8 words. line: one sentence, at most 20 words, with the number that proves it (a score, days, a price, a count).
  detail: 2-3 sentences for whoever taps in. status: new (a push that started recently), ongoing (sustained), or
  repeated (the same message or offer again). Evidence: the refs.${
    fresh ? " Lead with what the new signals mean." : ""
  }
- opportunities: 3-5 decisions, most important first, each one competitor move (or several connected ones) judged for
  ${brand.name}. type:
  - get_ahead: early signals suggest an opening; move before the market crowds it.
  - win_choice: competitors cluster around the same message; name an authentic strength ${brand.name} can lead with to stand out.
  - counter: a competitor's push threatens ${brand.name}'s position; a differentiated response, never a reflex copy.
  - ignore: it doesn't fit ${brand.name}'s customers, brand or economics; say why and save the money. Include at least one
    when anything notable doesn't fit.
  For each: title (the decision, at most 9 words); punch (one sentence, at most 20 words: what to do and the number
  behind it, tied to ${brand.name}'s own score or ads where the standing shows a gap); competitors; signal (what was observed, across channels, with dates or
  days running); intent (what they seem to be trying to do, hedged); fit (why it matters or doesn't for ${brand.name},
  against its profile, goal, constraints and past results); urgency and confidence (high, medium, low); scores 1-5 for
  relevance to its customers, urgency, differentiation potential, feasibility for this brand, and confidence; the
  recommendation in one or two sentences; and a brief, ready to test, in ${brand.name}'s voice: angle, hook (word for
  word), offer (or "none"), creative (what is shown, shot by shot or frame by frame), format (e.g. "9:16 UGC video,
  20s" or "email + landing page"), audience, and experiment (what to test against what, and how to tell it worked). For
  ignore, leave the brief's fields empty. Evidence: the refs.
- rivals: one entry per competitor above with any signal: their strategy in one or two sentences, and what to watch for next.
- landscape: where ${brand.name} sits in this market.
  - summary: two sentences on how the market is positioned and where ${brand.name} fits.
  - positions: one row for ${brand.name} first, then one per competitor: price_tier, the audience it targets, its main
    message, and its strength (what it does best across ads, site, email and social).
  - you_vs_them: only_you (angles, offers or claims ${brand.name} uses that no competitor does), only_them (what
    competitors lean on that ${brand.name} doesn't), and open_lanes (angles or audiences nobody is using well).
Ad repetition and longevity are imperfect proxies, not proof of performance; emails are only what subscribers see. Use
only refs that appear above.`;
}

const rank = (o: z.infer<typeof OpportunitySchema>) =>
  o.type === "ignore" ? -1 : o.scores.relevance + o.scores.urgency + o.scores.differentiation + o.scores.feasibility + o.scores.confidence;

export async function writeReport(input: ReportInput): Promise<ReportBody & { landscape: Landscape; opportunities: Opportunity[] }> {
  const body = await generateJson({ system: SYSTEM, schema: ReportSchema, prompt: reportPrompt(input) });
  const { site, emails } = refsOf(input);
  const ads = new Set([...input.rivals.flatMap((r) => r.ads.map((a) => a.archive_id)), ...(input.own ?? []).map((a) => a.archive_id)]);
  // Turn prompt refs into stored ids, and drop any the model made up, so every evidence link opens something real.
  const resolve = (refs: string[]) =>
    refs.flatMap((r) => {
      const ref = r.trim().replace(/^\[|\]$/g, "");
      if (ads.has(ref)) return [ref];
      const s = site.get(ref.toUpperCase());
      if (s) return [`site:${s.id}`];
      const e = emails.get(ref.toUpperCase());
      if (e) return [`email:${e.id}`];
      return [];
    });
  const insights = body.insights.map((i) => ({ ...i, evidence: resolve(i.evidence) }));
  const opportunities = [...body.opportunities]
    .sort((a, b) => rank(b) - rank(a))
    .map((o): Opportunity => ({
      type: o.type,
      title: o.title,
      punch: o.punch,
      competitors: o.competitors,
      signal: o.signal,
      intent: o.intent,
      fit: o.fit,
      urgency: o.urgency,
      confidence: o.confidence,
      recommendation: o.recommendation,
      brief: o.brief,
      evidence: resolve(o.evidence),
    }));
  return { ...body, insights, opportunities };
}
