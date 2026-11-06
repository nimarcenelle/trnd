# TRND for creators: brand

How TRND for creators looks and talks. It is TRND's own look (usetrnd.com), not a separate brand: creators and
businesses use one system, and the Business tier is the bridge between them. Any new UI follows it. The source of truth
for values is `app/globals.css` (tokens and component classes) and `components/brand.tsx` (the wordmark). If this file
and those disagree, fix whichever is wrong in the same change.

## Principles

- **Quiet on purpose.** A light ground, white cards with hairline borders, one green accent. The creator's numbers and
  scripts are the color on the page; the chrome stays out of the way.
- **The answer first.** Every screen opens with what to do (the gap, this week's three scripts). Data sits one tab behind.
- **Color means something.** Green (`--brand`): the action, the emphasis, a link, focus. Green (`--pos`): beat your
  usual. Red: below your usual, a miss. Amber: peaking, or riding a trend. Never decoration.
- **Not AI-looking.** No gradients, glows, grain, sparkle icons, emoji or purple. No "magic" language.
- **Real numbers only.** Public counts (views, likes, comments, shares, saves). Never watch time, retention or followers
  per video unless TikTok gave them to us for that account. Never a predicted follower count. A dollar figure only from a
  sourced rate, shown as a range with its assumption (see Voice).
- **Evidence next to every claim.** An idea shows the video it builds on, how far it beat its creator's usual, and its
  borrow score with what the score is made of.

## Wordmark

`components/brand.tsx`: a green dot (`--brand`, 0.46× the type size) and **TRND** in Jost 500, tracked 0.3em, in ink,
exactly as on usetrnd.com; "for creators" beside it in Inter 500, ink-2. Minimum size 13px.

## Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` / `--surface` | `#ffffff` | `#0b0b0c` / `#111113` | page / cards, inputs |
| `--subtle` / `--muted` | `#fafaf9` / `#f3f3f1` | `#111113` / `#19191c` | wells, pills, bar tracks |
| `--line` / `--line-strong` | `#e9e9e6` / `#d6d6d2` | `#232327` / `#323237` | hairlines, inputs |
| `--ink` / `--ink-2` / `--ink-3` | `#111110` / `#51514d` / `#868680` | `#ededec` / `#a3a3a0` / `#6f6f6c` | text |
| `--brand` / `--brand-soft` | `#0f8a78` / `#e6f4f1` | `#4fd1bb` / `#10302b` | primary button, links, emphasis |
| `--night` | `#141413` | `#19191c` | the week's answer block, the TikTok frame |
| `--pos` `--neg` `--warn` (+ `-bg`) | green / red / amber | | beat / missed / peaking |

`--cyan` survives as an alias of `--brand` so older components keep working: there is one accent. Tailwind:
`bg-surface`, `text-brand`, `bg-brand-soft`, `bg-night`, `text-ink-2` and so on. Never a hex value in a component
(the Satori images and emails, which can't read CSS variables, carry the same values by hand).

## Type

**Inter** for everything (self-hosted), headlines at 600 with tight tracking (`.display`, `.heading`). **JetBrains
Mono** for script timestamps and hashtags only. Jost is the wordmark only. `.label` is 12.5px semibold `--ink-3`,
sentence case; `.kicker` is 13.5px bold green. No all-caps labels. Sentence case everywhere, including buttons.

## Shape

Buttons, pills, chips and the handle box are fully round (999px). Cards 14px, idea cards and the answer block 18px,
wells 10px. 1px `--line` borders; shadows barely there (`--shadow-sm`), stronger only on the handle box and popovers.

## Motion

Sections slide up a few pixels on load, a beat apart (`.rise`); movement only, never a fade, and none with reduced
motion. One tilted element per screen at most.

## Components

In `app/globals.css` under `@layer components`: `.btn` (+ `-primary` green, `-ghost`, `-sm`, `-lg`), `.card`, `.night`,
`.handlebox`, `.input`, `.choice` (radio cards), `.pill` (+ `-pos`, `-neg`, `-warn`, `-brand`), `.chip`
(+ `-own`, `-miss`, `-tag`), `.tabs`/`.tab`, `.table`, `.bar`, `.stage`, `.so-what`, `.make`, `.label`, `.kicker`. The
idea card is `components/app/idea-card.tsx`; the pricing cards are `components/pricing.tsx`.

## Voice

- Talk like a smart friend who makes TikToks. Short sentences, everyday words.
- Sell the gap, not the tool: the distance between their typical views and the creators just ahead of them.
- Specific: name the video, quote the hook, give the number. "Got 4× your usual views", not "performed well".
- No hype: no "viral", "unlock", "game-changer", "algorithm hack", "AI-powered", no sparkle emoji in the UI.
- Money: Creator Rewards pays roughly $0.40–$1.00 per 1,000 qualified views by creators' own reports (TikTok publishes
  no rate). Show a dollar gap only as a range from that, with the assumption on hover, and only for an account that can
  earn it (10K+ followers). Otherwise show the view gap alone. Never invent a dollar figure.
- Say what we can't see, plainly, and what would change it.
- No invented social proof: no testimonials, "trusted by" rows, user counts or "creators joined today" counters.

## The funnel

- **The first screen asks one thing.** Visitors come from an ad or a post and know roughly what TRND does: `/` is the
  headline ("Make every post go viral."), one line, and the handle, typed big. Nothing else on the page.
- **One question a screen** after it (`/start/[id]`): "Is this you?", "What are you posting for?" while the read runs,
  with a step count and a progress bar at the top. Letter-badged choices, the answer ticked off as it goes.
- **Sell the diagnosis.** The result shows that something is wrong and how much (how many videos never got past their
  followers, the gap, their worst video) on the dark diagnosis card (`components/app/diagnosis-card.tsx`, the one
  dark surface, `.night`), and locks what it is: what's killing their posts, why they flop, what the creators ahead do.
  Locked text is filler, blurred; the real text never reaches the page. Paying unlocks it in the app.
- Blunt about the videos, never the person: "Your openings name the topic instead of giving anyone a reason to stay."

## Sample data

Marketing mockups show a monetizing creator (around 40K followers) or a local business, never an account under 10K.
They are invented accounts with invented names (`components/sample/`), drawn by the same components as the real
pages. Never put a real account's name on invented numbers.
