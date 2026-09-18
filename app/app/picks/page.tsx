import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

// The waiting states below have nothing on them to keep, and the whole page
// changes when the picks land, so they poll the page itself.
import AutoRefresh from "@/components/app/auto-refresh";
import WeekClock from "@/components/app/week-clock";
import { BRIEF_FALLBACK_MODEL, BRIEF_PROMPT_VERSION, briefLikelyInFlight, generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isEmailConfigured, isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { firstWeekMode } from "@/lib/onboarding/context";
import { nextWeekStage } from "@/lib/picks/advance-week";
import { conceptRow, STATUS_LABEL } from "@/lib/picks/concept-view";
import { PICKS_PER_WEEK } from "@/lib/picks/generate";
import { kickWeekJob } from "@/lib/picks/kick";
import { waitHeadline, weekProgress } from "@/lib/picks/progress";
import { dueForKick, emptyWeekLine, truncateFinding, weekRangeLabel } from "@/lib/picks/list";
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
    const mode = firstWeekMode({ adHistoryRows: history.length, objectives: (business.campaign_objectives ?? []).length });
    const chosen = concepts.filter((c) => c.row?.status === "chosen" || c.row?.status === "launched").length;
    // A fresh signup's first concept lands alone and the rest follow a
    // minute or two later. While they are still being written the list is
    // short because it is unfinished, not because the week was thin, and it
    // says so and keeps asking for the next stage.
    const stillWriting =
      rows.length < PICKS_PER_WEEK && (await nextWeekStage(repo, business, { scanAllowed: isSupabaseConfigured })) === "picks";
    if (stillWriting) await kickWeekJob(business.id, { now });
    return (
      <div className="page picks">
        {stillWriting && <AutoRefresh everyMs={6000} times={40} />}
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
            <Link href={mode.researchOnly ? "/app/settings#integrations" : "/app/settings#context"}>
              {mode.researchOnly ? "Connect Meta or add an export" : "Set the objectives"}
            </Link>
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
        {stillWriting ? (
          <p className="cbl__fewer" role="status">
            The rest of the week is being written and lands here in a minute or two.
          </p>
        ) : (
          rows.length < PICKS_PER_WEEK && (
            <p className="cbl__fewer">
              {rows.length === 1 ? "Only one concept" : "Only two concepts"} cleared the bar this week. TRND shows fewer rather
              than fill the list with repeats or weak ideas.
            </p>
          )
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
    const { analysis, found } = progress;
    const firstPickMin = Math.max(1, Math.ceil(progress.remainingSec / 60));
    return (
      <div className="page picks">
        <AutoRefresh everyMs={6000} times={100} />
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>{waitHeadline(progress, business.name)}</h1>
            <p className="context">
              Your first pick lands in about {firstPickMin} minute{firstPickMin === 1 ? "" : "s"}, the rest of the week
              a minute after. TRND reads your customers, your category and your competitors before it grades anything,
              and what it finds shows up here as it lands
              {isEmailConfigured ? ". You get one email when the picks are written" : ""}.
            </p>
          </div>
        </div>
        <div className="wk">
          <section className="panel wk-main" aria-label="What TRND has found so far">
            {analysis ? (
              <div className="wk-analysis">
                <p className="mono-label">Your analysis</p>
                <p className="wk-analysis__positioning">{analysis.positioning}</p>
                {analysis.who && (
                  <p className="wk-analysis__who">
                    <b>Who buys:</b> {analysis.who}
                  </p>
                )}
                {analysis.watchTerms.length > 0 && (
                  <ul className="wk-chips" aria-label="Terms being watched">
                    {analysis.watchTerms.map((t) => (
                      <li key={t}>{sentenceCase(t)}</li>
                    ))}
                  </ul>
                )}
                {brief && (
                  <Link className="wk-analysis__link" href="/app/snapshot">
                    Read the full analysis
                  </Link>
                )}
              </div>
            ) : (
              <div className="wk-analysis is-pending" aria-busy="true">
                <p className="mono-label">Your analysis</p>
                <div className="skeleton h-[14px] w-[90%]" />
                <div className="skeleton h-[14px] w-[76%]" />
                <div className="skeleton h-[14px] w-[58%]" />
              </div>
            )}

            {found.terms.length > 0 && (
              <div className="wk-found">
                <p className="mono-label">Rising right now</p>
                <ul className="wk-found__list">
                  {found.terms.map((t) => (
                    <li key={t.term}>
                      <span className="wk-found__term">{sentenceCase(t.term)}</span>
                      <span className="wk-found__delta">↑{t.deltaPct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {found.rivals.length > 0 && (
              <div className="wk-found">
                <p className="mono-label">Competitors being read</p>
                <ul className="wk-found__list">
                  {found.rivals.map((r) => (
                    <li key={r.name}>
                      <span className="wk-found__term">{sentenceCase(r.name)}</span>
                      {r.ads !== null && (
                        <span className="wk-found__meta">
                          {r.ads} active ad{r.ads === 1 ? "" : "s"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {progress.ranked.length > 0 && (
              <div className="wk-ranked">
                <p className="mono-label">This week&apos;s opportunities, being written up</p>
                <ul className="wk-ranked__list">
                  {progress.ranked.map((r) => (
                    <li key={r.term}>
                      <span className="wk-ranked__term">{sentenceCase(r.term)}</span>
                      {r.grade && <span className="picks-grade is-amber">{r.grade}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="panel wk-side" aria-label="Progress">
            <WeekClock startedAt={business.created_at} remainingSec={progress.remainingSec} />
            <ol className="wk-progress">
              {progress.steps.map((step) => (
                <li key={step.key} className={`wk-progress__row is-${step.state}`}>
                  <span className="wk-progress__mark" aria-hidden="true" />
                  <span className="wk-progress__text">
                    <span className="wk-progress__label">
                      {step.label}
                      {step.state === "current" && (
                        <span className="wk-progress__typical"> · usually about {step.typicalSec}s</span>
                      )}
                    </span>
                    {step.detail && <span className="wk-progress__detail">{step.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    );
  }

  // An empty week says why: every candidate held, and which signals had
  // nothing to read. "Nothing worth spending on" was printed over weeks
  // where the grade had only the market to rest on.
  const [skips, history, competitors] = await Promise.all([
    repo.listWeekSkips(business.id, week).catch(() => []),
    repo.listAdHistory(business.id).catch(() => []),
    repo.listCompetitors(business.id).catch(() => []),
  ]);
  const empty = emptyWeekLine({ held: skips.length, adHistoryRows: history.length, competitors: competitors.length, where, category: sentenceCase(business.category) });

  return (
    <div className="page picks">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">This week · {weekRange}</span>
          <h1>No tests this week</h1>
          <p className="context">{empty.line}</p>
        </div>
      </div>
      <div className="panel max-w-[620px]">
        {empty.missing.length > 0 ? (
          <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
            What the grade could not read is what to add. Each brief is then checked against your own ads and your rivals&apos;
            instead of the market alone.
          </p>
        ) : (
          <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
            TRND shows nothing rather than a weak idea dressed up as a test.
          </p>
        )}
        <div className="flex gap-3 flex-wrap mt-[18px]">
          {empty.missing.map((m) => (
            <Link key={m.href} className="btn btn-primary btn-sm" href={m.href}>
              {m.label}
            </Link>
          ))}
          <Link className="btn btn-ghost btn-sm" href="/app/snapshot">
            Your analysis
          </Link>
        </div>
      </div>
    </div>
  );
}
