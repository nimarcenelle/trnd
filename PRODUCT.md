# TRND — What the product does

**One line (September 2026):** TRND is the weekly creative test agenda for a DTC brand on
Meta: every Monday, up to three (or one, or five, by plan) creative tests worth running, each a
hypothesis with the evidence behind it and what that evidence cannot say, in a brief a creator
can shoot from; then the finished ad checked against the brief, and a record of what happened,
by test, by whether the ad followed its brief, and by angle across every ad the brand ever ran,
summed in public at `/record`. It does not predict winners, and it does not run ads. Priced on
access: three plans metered on briefs a week, rivals tracked and seats.

This file describes the product that is sold. Nothing else is a route. The older
keyword-pick and campaign-builder screens were removed on 2026-09-17 (see DECISIONS.md);
their tables remain in the schema and are simply unused.

## The loop, in five screens

1. **Apply, then sign up with an invite.** The landing page sells one thing: a
   founder-assisted one-month pilot at $500. Applications land in `pilot_applications`
   and alert the founder. With `PILOT_INVITE_CODE` set, signup needs the code.
2. **Onboarding** (`/onboarding`): the website read (products, prices, accounts, photos),
   then the context a brief needs that a site cannot say: campaign objective, what the brand
   can produce, what it shot last, what it may claim, and an Ads Manager export. The export
   is what makes week one a real baseline instead of research only; the week says which.
3. **This week** (`/app/picks`): up to three creative tests in priority order. Each opens
   as the whole brief (`/app/picks/[id]`): the customer situation, the hypothesis, the
   brand's own record on that shape, why it is worth a test now, how it differs from recent
   creative, the hook and its alternatives, direction (show, say, prove), the shot list, the
   approved facts, how to judge the test, what to name the ad, what each outcome teaches,
   and the evidence with its limits. Copy it, export it, refine it in place, choose it for
   production, mark it launched, or pass with a reason.
4. **Campaigns** (`/app/campaigns`): every test the brand chose, in the order it moved.
   Chosen is not launched, launched is not successful, no result is not a loss. A launched
   test is closed with whatever numbers the owner has, or gets them by name from the
   brand's own ad history (an export, or the connected Meta account's daily sync).
5. **Track record** (`/app/record`): hit rate over scored runs; the record split by whether
   the ad followed its brief (so a loss says whether the idea or the shoot lost); every ad the
   brand ever ran classified by angle, with click-through, cost per purchase, hook rate and
   hold rate against the account; predicted against actual per grade; every run with its
   outcome and reason; and what the week held back. **Snapshot** (`/app/snapshot`) is the
   founding analysis every week is written against; **Settings** holds the catalog (with cost
   and variants once Shopify is connected), competitors, documents, past ads, context, the
   team roster, the plan and integrations.

**Around the loop.** A brief is shared by link with a creator who will never log in
(`/share/<token>`), or exported as text, Markdown or Word. A teammate the owner invites by
email sees the brand the way the owner does. A launched test is pointed at its ad by id
from Campaigns when the naming convention was not followed. The public record at `/record`
sums every brand's tests with nothing named. The founder's free account read (the
prospector's top box) runs a prospect through the whole signup read and writes the teardown
email that is the pitch.

The **Monday email** delivers the week's tests, the tests still in progress that want
results, and what the week could not check. It links into the app; it never carries a
grade.

## What a brief is made of

**Evidence is separate from judgment.** Evidence rows are built by code from what was read,
each with its kind (observed, quoted, measured, context), the date, the sample size and a
limitation line ("Running does not mean it works"). The writer's judgments are stored as
written and labeled hypotheses. Its facts are checked before storage: every figure, price and
approved fact must trace to the catalog, the owner's notes, uploaded documents or the evidence
rows; invented percentages, unlisted prices, result promises, certainty language and phrases
the owner forbade fail the draft, and the retry is told which line (`lib/picks/concept.ts`).

**The first three seconds are dictated; the rest is directed.** The brief carries the opening
shot by shot (what the camera sees, what is on screen, what is said), the first beat saying the
hook word for word, validated by the same fact rules as everything else. The direction after
that is for the person making it.

**The brand's own record.** Each concept is classified by shape and compared to the brand's
last three ads of that shape against the account's click-through
(`historyLineage`, `lib/ads/history-read.ts`). The line is written by code from the counts,
stored on the brief, and shown on the page and in the copied text. Every ad in the history
is classified by angle, opening and format on arrival (`lib/ads/classify.ts`), so the record
reads the whole account and not only TRND's tests.

**The finished ad against the brief.** On Campaigns the owner pastes the ad's words (or the
linked ad's copy is read) and the check says whether it opened on the hook, followed the
opening, used only the approved facts and matched the format (`lib/picks/fidelity.ts`). The
score lands on the run; the record counts tests that followed the brief apart from tests
that strayed.

**No universal kill rule.** The evaluation plan is built from the campaign objective, the
account's own baseline and dates when an export is on file, the spend band and how many
results a week can hold, and it names what is missing rather than inventing a threshold
(`lib/picks/evaluation.ts`).

**No grades on the page.** The rank and the reason under it are the priority. The internal
four-signal score orders the candidates; it is checked against results on the Track record,
not shown as a probability of success.

**Statuses mean one thing each.** Proposed, chosen, launched, ended, passed. A stopped or
lost concept holds its term for two or three weeks and comes back as a different concept.
What the owner recorded as learned is carried to the next week's writer.

## Where the numbers come from

- **The brand's own results.** An Ads Manager or Google Ads export read deterministically at
  onboarding or in Settings (`lib/ads/import.ts`), or the connected Meta account's last 180
  days of ad-level insights with purchases, purchase value, 3-second plays, ThruPlays and the
  creative, synced daily (`lib/ads/history-sync.ts`). Either way the rows land in
  `ad_history`, the Brand signal's baseline. A test named the way its brief says
  (`TRND: <concept title>`), or the ad the owner linked to it by id, gets its numbers from
  those rows (`lib/ads/run-sync.ts`). TRND never creates or changes a campaign.
- **The brand's own store.** A Shopify custom app token connects the store: products with
  cost (the margin an offer can afford), variants and stock, the last 30 days of orders split
  first against returning, and the discount codes live today (`lib/shopify`). The dossier and
  the brief carry them; an offer test never repeats what checkout already gives away.
- **The customer's words.** Comments under the brand's and its rivals' posts, reviews
  (Trustpilot, Places, rivals' sites), Reddit threads and autocomplete phrasings. Quoted as
  written, with the sample beside them.
- **Competitors.** Direct rivals' Meta ads by Page and Google Transparency ads by domain,
  read weekly and quoted as observed on a date; their posts.
- **Search and short-form.** Search volume per metro (DataForSEO), Google Trends, autocomplete,
  news, the TikTok trending board; YouTube Shorts and per-term TikTok when their keys are set.
  Settings names only the reads that run with the keys as set.

Every paid call outside the model is metered per brand (`provider_usage`); a fully
switched-on brand costs roughly $5 to $10 a week in provider calls.

## Modes & infrastructure

The model is OpenAI (`lib/ai/openai.ts`, the only SDK import), held to strict structured
output built from the Zod schema each reply is validated with. With **zero env keys** the whole
product runs in a loudly-labeled demo mode: local seeded store, local auth, the template
concept writer, the rules classifiers, dormant billing. Each key switches its
subsystem on independently; `GO-LIVE.md` lists them in the order they matter and
`BLOCKED.md` explains each seam. `GET /api/health` reports each subsystem's mode and the
day's model and provider spend. Crons (`vercel.json`): daily ingest, intel and ranking;
Monday picks and email; daily results sync.

Ops surface: `/terms` and `/privacy` match actual behavior; account deletion cascades in
both storage modes; the unit suite, a signup-to-track-record Playwright E2E, lint and
typecheck gate every change.
