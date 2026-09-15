import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

// The waiting states below have nothing on them to keep, and the whole page
// changes when the picks land, so they poll the page itself.
import AutoRefresh from "@/components/app/auto-refresh";
import WeekLoading from "@/components/app/week-loading";
import { BRIEF_FALLBACK_MODEL, BRIEF_PROMPT_VERSION, briefLikelyInFlight, generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isEmailConfigured, isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { firstWeekMode } from "@/lib/onboarding/context";
import { groupWeek, STATUS_LABEL, type ConceptRow } from "@/lib/picks/concept-view";
import { productsToBrief } from "@/lib/picks/generate";
import { kickWeekJob } from "@/lib/picks/kick";
import { waitHeadline, weekProgress } from "@/lib/picks/progress";
import { dueForKick, truncateFinding, weekRangeLabel } from "@/lib/picks/list";
import { weekOf } from "@/lib/recommend/week";
import { isOnlineBusiness } from "@/lib/signals/geo";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "This week — TRND" };

// Per-process memory of the last analysis refresh this page asked for.
const briefKicks = new Map<string, number>();
const BRIEF_KICK_WINDOW_MS = 15 * 60_000;

// The kick guards compare against wall time. Read once per request, outside
// the render body, so the component itself stays pure.
function requestTime(): number {
  return Date.now();
}

// This route never calls a model on the request path, and never runs the
// week's chain itself: the week job does, one stage per invocation
// (lib/picks/advance-week.ts). It reads what the week still needs, asks for
// the next stage, and once picks exist sends the owner to the first one.

export default async function PicksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  const weekRange = weekRangeLabel(week);
  const [rows, brief, services] = await Promise.all([
    repo.listOpenPicks(business.id, week).catch(() => repo.listReadyPicks(business.id, week)),
    repo.getBusinessBrief(business.id),
    repo.listServices(business.id),
  ]);

  // Re-evaluate alerts after the response. Idempotent (deduped keys), so the
  // week's page doubles as the alert heartbeat between crons.
  after(async () => {
    try {
      const { evaluateAlerts } = await import("@/lib/alerts/engine");
      await evaluateAlerts(repo, business);
    } catch (err) {
      console.warn("[picks] alert evaluation failed (non-fatal):", (err as Error).message);
    }
  });

  // An analysis written by an older prompt, or the keyless template once a
  // key exists, is rewritten in the background. The week's picks stay put.
  const now = requestTime();
  if (
    brief &&
    (brief.prompt_version !== BRIEF_PROMPT_VERSION || (brief.model_used === BRIEF_FALLBACK_MODEL && isGeminiConfigured)) &&
    dueForKick(briefKicks.get(business.id), now, BRIEF_KICK_WINDOW_MS)
  ) {
    briefKicks.set(business.id, now);
    after(async () => {
      try {
        await repo.upsertBusinessBrief(await generateBusinessBrief(business, await repo.listServices(business.id)));
      } catch (err) {
        console.warn("[picks] brief refresh failed (non-fatal):", (err as Error).message);
      }
    });
  }

  // The week is a short list: what to make next, and why, one line each.
  // Opening a row is the whole brief. Fewer than three means the week did
  // not have three ideas worth a test, and says so.
  if (rows.length > 0) {
    const products = productsToBrief(business, services);
    const views = groupWeek(rows, products);
    const legacy = rows.filter(({ pick }) => !pick.brief || !pick.concept_title);
    const chosen = rows.filter(({ run }) => run && (run.status === "planned" || run.status === "running")).length;
    // What this week can and cannot say, from what the brand handed over.
    const history = await repo.listAdHistory(business.id).catch(() => []);
    const mode = firstWeekMode({ adHistoryRows: history.length, hasObjective: Boolean(business.campaign_objective) });
    const row = (r: ConceptRow, showProduct: boolean) => {
      const status = STATUS_LABEL[r.status];
      return (
        <li key={r.id}>
          <Link href={r.href} className="cbl__row">
            <span className={`cbl__rank${r.timing?.kind === "evergreen" ? " is-evergreen" : ""}`} aria-hidden="true">
              {r.timing?.kind === "evergreen" ? "∞" : r.rank}
            </span>
            <span className="cbl__body">
              <span className="cbl__title">{r.title}</span>
              <span className="cbl__hyp">{truncateFinding(r.hypothesis, 180)}</span>
              <span className="cbl__tags">
                {showProduct && r.serviceId && <span className="cbl__tag cbl__tag--product">{products.find((p) => p.id === r.serviceId)?.name}</span>}
                {r.timing && (
                  <span className={`cbl__tag is-${r.timing.kind}`} title={r.timing.meaning}>
                    {r.timing.label}
                  </span>
                )}
                {r.angle && <span className="cbl__tag">{r.angle}</span>}
                <span className="cbl__tag">{r.format}</span>
                <span className="cbl__tag">{r.basis.label}</span>
              </span>
            </span>
            <span className="cbl__meta">
              {r.status !== "proposed" && (
                <span className={`badge${status.tone ? ` badge--${status.tone}` : ""}`} title={status.meaning}>
                  <i />
                  {status.label}
                </span>
              )}
            </span>
          </Link>
        </li>
      );
    };
    return (
      <div className="page picks">
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>What to make next</h1>
            <p className="context">
              Creative tests by product. Each is a hypothesis with the evidence behind it and a brief you can hand to a
              creator. A concept marked <b>This week</b> has something in this week&apos;s reads pointing at it; one marked{" "}
              <b>Anytime</b> is the ad to make for that product regardless, and it stays until you act on it.
              {chosen > 0 ? ` ${chosen} in production or launched.` : ""}
            </p>
          </div>
          <Link href="/app/campaigns" className="btn btn-ghost btn-sm">
            Tests in progress
          </Link>
        </div>
        {mode.line && (
          <p className={`cbl__mode${mode.researchOnly ? " is-research" : ""}`} role="status">
            {mode.line}{" "}
            <Link href="/app/settings#ads">{mode.researchOnly ? "Add an export" : "Set the objective"}</Link>
          </p>
        )}

        <section className="cbl__section" aria-labelledby="cbl-week">
          <h2 id="cbl-week" className="cbl__h2">
            This week
          </h2>
          {views.thisWeek.length > 0 ? (
            <ol className="cbl">{views.thisWeek.map((r) => row(r, true))}</ol>
          ) : (
            <p className="cbl__fewer">
              Nothing in this week&apos;s reads is pushing one product over another. That is a finding, not a gap: the options
              below are the ads to make anyway.
            </p>
          )}
        </section>

        {views.byProduct.map((g) => (
          <section key={g.id ?? "other"} className="cbl__section" aria-labelledby={`cbl-${g.id ?? "other"}`}>
            <h2 id={`cbl-${g.id ?? "other"}`} className="cbl__h2">
              {g.name}
              <span className="cbl__count">
                {g.rows.length} {g.rows.length === 1 ? "concept" : "concepts"}
              </span>
            </h2>
            <ol className="cbl">{g.rows.map((r) => row(r, false))}</ol>
          </section>
        ))}

        {legacy.length > 0 && (
          <section className="cbl__section" aria-labelledby="cbl-legacy">
            <h2 id="cbl-legacy" className="cbl__h2">
              Earlier picks
            </h2>
            <ol className="cbl">
              {legacy.map(({ pick, run }) => (
                <li key={pick.id}>
                  <Link href={`/app/picks/${pick.id}`} className="cbl__row">
                    <span className="cbl__rank">{pick.rank}</span>
                    <span className="cbl__body">
                      <span className="cbl__title">{sentenceCase(pick.term)}</span>
                      <span className="cbl__hyp">{truncateFinding(pick.finding)}</span>
                    </span>
                    <span className="cbl__meta">{run ? <span className="badge"><i />{run.status}</span> : null}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
        {products.length > views.byProduct.filter((g) => g.id).length && (
          <p className="cbl__fewer">
            Concepts for the rest of your products are written over the next days, one per product per pass, so nothing here
            is rewritten under you. Choose which products to brief for in{" "}
            <Link href="/app/settings#context">Settings</Link>.
          </p>
        )}
      </div>
    );
  }

  const where = isOnlineBusiness(business) ? "across the US" : `around ${business.city}`;

  // One wait from signup to the first pick. Every step is read from the
  // database, the finished ones say what they found, and the ranked terms
  // show with their grades while the picks are still being written. The
  // job is asked for whatever the week still needs. No alerts here: an
  // owner with no picks yet has nothing to be alerted about.
  const progress = await weekProgress(repo, business, { scanAllowed: isSupabaseConfigured });
  if (progress.stage !== "done") {
    const briefInFlight = !brief && briefLikelyInFlight(business.created_at);
    if (!briefInFlight) await kickWeekJob(business.id, { now });
    const firstPickMin = Math.max(1, Math.ceil(progress.remainingSec / 60));
    // One picture while the reads run. What they find lands on the briefs
    // and the analysis, not on this screen, so nothing here fills in piece
    // by piece.
    return (
      <div className="page picks">
        <AutoRefresh everyMs={6000} times={100} />
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>{waitHeadline(progress, business.name)}</h1>
            <p className="context">
              Your first brief lands in about {firstPickMin} minute{firstPickMin === 1 ? "" : "s"}, the rest of the week a
              minute after. TRND reads your customers, your category and your competitors before it writes anything
              {isEmailConfigured ? ", and you get one email when the briefs are written" : ""}.
            </p>
          </div>
        </div>
        <WeekLoading
          startedAt={business.created_at}
          remainingSec={progress.remainingSec}
          steps={progress.steps.map((s) => ({ key: s.key, label: s.label, state: s.state, typicalSec: s.typicalSec }))}
        />
      </div>
    );
  }

  return (
    <div className="page picks">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">This week · {weekRange}</span>
          <h1>No picks this week</h1>
          <p className="context">
            This week&apos;s reads for <b>{sentenceCase(business.category)}</b> {where} did not turn up a pick worth
            spending on.
          </p>
        </div>
      </div>
      <div className="panel max-w-[620px]">
        <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
          The daily read keeps going. New picks land on Monday.
        </p>
        <div className="flex gap-3 flex-wrap mt-[18px]">
          <Link className="btn btn-ghost btn-sm" href="/app/report">
            Weekly report
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/app/snapshot">
            Your analysis
          </Link>
        </div>
      </div>
    </div>
  );
}
