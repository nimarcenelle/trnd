# TRND for creators: brand

How TRND for creators looks and talks. Any new UI follows it. The source of truth for values is `app/globals.css`
(tokens and component classes) and `components/brand.tsx` (the wordmark). If this file and those disagree, fix whichever
is wrong in the same change.

## Principles

- **Feels like it belongs next to TikTok, isn't a clone.** A warm off-white page, white cards, one hot pink, cyan for
  hashtags and trends, pills instead of boxes, bold, tightly set headlines.
- **The answer first.** Every screen opens with what to do (the week's answer, three ideas). Data sits one tab behind.
- **Color means something.** Pink (`--brand`): the action, the rank, the emphasis in the answer. Cyan: hashtags,
  sounds, trends. Green: beat your usual, a strength. Red: below your usual, a miss. Amber: peaking.
- **Real numbers only.** Public counts (views, likes, comments, shares, saves). Never watch time, retention or
  followers per video unless TikTok gave them to us for that account. Never a predicted follower count.
- **Evidence next to every claim.** An idea shows the video it builds on, how far it beat its creator's usual, and its
  borrow score with what the score is made of.

## Wordmark

`components/brand.tsx`: **TRND** in Unbounded 800 with a pink period, "for creators" beside it in Figtree 600, ink-2.
The wordmark is the only place Unbounded appears.

## Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f7f5f8` | `#110e14` | page |
| `--surface` | `#ffffff` | `#1a161f` | cards, inputs |
| `--muted` | `#efebf1` | `#221d28` | pills, bar tracks, caption wells |
| `--line` / `--line-strong` | `#e1dce5` / `#cfc8d6` | `#30293a` / `#40384b` | borders |
| `--ink` / `--ink-2` / `--ink-3` | `#17131b` / `#625b6a` / `#8f879a` | `#f1edf4` / `#aea5b9` / `#7d7489` | text |
| `--brand` / `--brand-soft` | `#e0245e` / `#fde6ee` | `#ff5c8a` / `#3a1626` | primary button, rank, emphasis |
| `--cyan` / `--cyan-soft` | `#0b8fa3` / `#def3f6` | `#45c6d8` / `#12303a` | hashtags, sounds, rising |
| `--night` | `#1d1724` | `#241d2c` | the week's answer block |
| `--pos` `--neg` `--warn` (+ `-bg`) | green / red / amber | | beat / missed / peaking |

Tailwind: `bg-surface`, `text-brand`, `bg-brand-soft`, `text-cyan`, `bg-night`, `text-ink-2` and so on. Never a hex value
in a component.

## Type

- **Figtree**, tight tracking: `.display` 750 (landing headlines, the rank number), `.heading` 700 (page and section
  titles, the hook). Unbounded read too wide and heavy at headline sizes.
- **Figtree**: everything you read. 15px body.
- **JetBrains Mono**: script timestamps and hashtags only.
- `.label` is 12.5px semibold `--ink-3`, sentence case; `.kicker` is 13.5px bold pink. No all-caps labels.

Sentence case everywhere, including buttons.

## Shape

Buttons, pills, chips and the handle box are fully round (999px). Cards 14px, idea cards and the answer block 18px,
wells 10px. 1px `--line` borders; shadows only on the handle box and popovers.

## Depth and texture

The page isn't flat. Every page has two soft glows at the top (pink left, cyan right) and a whisper of film grain
(`body::after`, 3.5% light, 5% dark). Cards carry a brand-tinted shadow, never plain grey. The week's answer (`.night`) is
lit by a pink glow top-left and a cyan one bottom-right, with grain; its emphasis runs pink to peach. The "Your next
TikTok" phones glow in their idea type's color and show the cover of the video they build on, blurred, when we have it.

- **Stats**: one card each, an oversized number (`.stat-num`), pink-to-peach when it's a win (`.stat-up`). "Your typical
  video" carries the creator's recent views as a bar strip (`components/app/views-strip.tsx`), breakouts in pink.
- **Ideas**: a header strip tinted by type and a numbered badge (`.idea-head`, `.rank-badge`, colored by `--tint`).
- **Creators ahead of you**: a pink-to-cyan ring around the initial (`<Avatar ring />`).
- **Hashtag chips**: stickers, a soft fill with a small bottom lip.
- **Motion**: sections slide up a few pixels on load, a beat apart (`.rise`); movement only, never a fade, and none
  with reduced motion.
- Keep it rare: one tilted element per screen at most (the landing phone), glows only at the top of a page or behind
  the one hero element, never behind body text.

## Components

In `app/globals.css` under `@layer components`: `.btn` (+ `-primary` pink, `-ghost`, `-sm`, `-lg`), `.card`, `.night`,
`.handlebox`, `.input`, `.choice` (radio cards), `.pill` (+ `-pos`, `-neg`, `-warn`, `-cyan`, `-brand`), `.chip`
(+ `-own`, `-miss`, `-tag`), `.tabs`/`.tab`, `.table`, `.bar`, `.stage`, `.so-what` (pink rule), `.make` (cyan rule),
`.label`, `.kicker`. The idea card is `components/app/idea-card.tsx`.

## Voice

- Talk like a smart friend who makes TikToks. Short sentences, everyday words.
- Specific: name the video, quote the hook, give the number. "Got 4× your usual views", not "performed well".
- No hype: no "viral", "unlock", "game-changer", "algorithm hack", "AI-powered", no sparkle emoji in the UI.
- Say what we can't see, plainly, and what would change it.
- No invented social proof: no made-up testimonials, user counts or "creators joined today" counters.

## Sample data

The landing page shows a real free preview of @humm.app, snapshotted into `components/sample/humm-preview.json` by
`scripts/snapshot-sample.mjs` and drawn by the same components as `/start/[id]`; it is never fetched live.
Never put a real account's name on invented numbers.
