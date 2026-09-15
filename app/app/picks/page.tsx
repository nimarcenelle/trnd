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
import { conceptRow, STATUS_LABEL } from "@/lib/picks/concept-view";
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
  const [rows, brief] = await Promise.all([repo.listReadyPicks(business.id, week), repo.getBusinessBrief(business.id)]);

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
    const concepts = rows.map(({ pick, run }) => ({ pick, run, row: conceptRow(pick, run) }));
    // What this week can and cannot say, from what the brand handed over.
    const history = await repo.listAdHistory(business.id).catch(() => []);
    const mode = firstWeekMode({ adHistoryRows: history.length, hasObjective: Boolean(business.campaign_objective) });
    const chosen = concepts.filter((c) => c.row?.status === "chosen" || c.row?.status === "launched").length;
    return (
      <div className="page picks">
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>What to make next</h1>
            <p className="context">
              {rows.length === 1 ? "One creative test" : `${rows.length} creative tests`} worth running this week, in priority
              order. Each is a hypothesis with the evidence behind it and a brief you can hand to a creator.
              {chosen > 0 ? ` ${chosen} chosen so far.` : ""}
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
        <ol className="cbl" aria-label="This week's creative tests">
          {concepts.map(({ pick, run, row }) => {
            if (!row) {
              // A pick written before briefs existed: the term and its finding.
              return (
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
              );
            }
            const status = STATUS_LABEL[row.status];
            return (
              <li key={pick.id}>
                <Link href={row.href} className="cbl__row">
                  <span className="cbl__rank">{row.rank}</span>
                  <span className="cbl__body">
                    <span className="cbl__title">{row.title}</span>
                    <span className="cbl__hyp">{truncateFinding(row.hypothesis, 180)}</span>
                    <span className="cbl__tags">
                      <span className="cbl__tag">{row.format}</span>
                      <span className="cbl__tag">{row.basis.label}</span>
                    </span>
                  </span>
                  <span className="cbl__meta">
                    {row.status !== "proposed" && (
                      <span className={`badge${status.tone ? ` badge--${status.tone}` : ""}`} title={status.meaning}>
                        <i />
                        {status.label}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        {rows.length < 3 && (
          <p className="cbl__fewer">
            {rows.length === 1 ? "Only one concept" : "Only two concepts"} cleared the bar this week. TRND shows fewer rather
            than fill the list with repeats or weak ideas.
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
