# TRND for creators: brand

How TRND for creators looks and talks. Any new UI follows it. The source of truth for values is `app/globals.css`
(tokens and component classes) and `components/brand.tsx` (the wordmark). If this file and those disagree, fix whichever
is wrong in the same change.

## Principles

- **Feels like it belongs next to TikTok, isn't a clone.** A warm off-white page, white cards, one hot pink, cyan for
  hashtags and trends, pills instead of boxes, a big confident display face.
- **The answer first.** Every screen opens with what to do (the week's answer, three ideas). Data sits one tab behind.
- **Color means something.** Pink (`--brand`): the action, the rank, the emphasis in the answer. Cyan: hashtags,
  sounds, trends. Green: beat your usual, a strength. Red: below your usual, a miss. Amber: peaking.
- **Real numbers only.** Public counts (views, likes, comments, shares, saves). Never watch time, retention or
  followers per video unless TikTok gave them to us for that account. Never a predicted follower count.
- **Evidence next to every claim.** An idea shows the video it builds on, how far it beat its creator's usual, and its
  borrow score with what the score is made of.

## Wordmark

`components/brand.tsx`: **TRND** in Unbounded 800 with a pink period, "for creators" beside it in Figtree 600, ink-2.

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

- **Unbounded** (600, 800): `.display` (landing headlines, the rank number), `.heading` (page and section titles, the hook).
- **Figtree**: everything you read. 15px body.
- **JetBrains Mono**: `.label` (11px uppercase labels), script timestamps, hashtags, numbers in a strip.

Sentence case everywhere, including buttons.

## Shape

Buttons, pills, chips and the handle box are fully round (999px). Cards 14px, idea cards and the answer block 18px,
wells 10px. 1px `--line` borders; shadows only on the handle box and popovers.

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

## Sample data

The landing page uses invented creators only (`@marlow.studies`, `@fenn.explains`; `components/sample/creator.ts`).
Never put a real account's name on invented numbers.
