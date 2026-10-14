# TRND brand

This is the look of TRND as shipped: the landing page, the briefing, the rival and brand pages. Any new UI follows it.
The source of truth for values is `app/globals.css` (tokens and component classes) and `components/brand.tsx` (the
wordmark). If this file and those disagree, fix whichever is wrong in the same change.

## Principles

- **Quiet on purpose.** White and near-black, one typeface, hairline borders. The ads and the findings are the
  color on the page; the chrome stays out of the way.
- **Color only where it means something.** Green: a new ad, growth. Red: an ad that stopped, a failure. Amber: an ad
  that has proven itself (21+ days live). Teal (`--brand`): the TRND mark, links, focus rings, "testing". Never
  decoration.
- **Not AI-looking.** No gradients, glows, glassmorphism, sparkle icons, emoji, purple, or "magic" language. No
  rounded-everything pill soup. It should read like a well-made analytics tool (Linear, Stripe Dashboard, Vercel),
  not a chatbot.
- **Evidence first.** Every claim sits next to the ad that shows it: a thumbnail, days running, versions, a link to
  the Ad Library.
- **Light by default**, with a dark theme from the toggle (`[data-theme="dark"]`).

## Wordmark

`components/brand.tsx`: a teal dot (`--brand`, 0.46× the type size) and **TRND** in Jost 500, tracked 0.3em, in ink.
Always uppercase, never with a tagline lockup, never recolored except ink on light and ink on dark. Minimum size 13px.

## Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0b0b0c` | page, cards |
| `--subtle` | `#fafaf9` | `#111113` | wells, table hover, secondary hover |
| `--muted` | `#f3f3f1` | `#19191c` | ghost hover, skeletons |
| `--line` | `#e9e9e6` | `#232327` | hairline borders, dividers |
| `--line-strong` | `#d6d6d2` | `#323237` | inputs, secondary buttons |
| `--ink` | `#111110` | `#ededec` | text, primary buttons |
| `--ink-2` | `#51514d` | `#a3a3a0` | body copy, labels |
| `--ink-3` | `#868680` | `#6f6f6c` | captions, metadata |
| `--brand` | `#0f8a78` | `#4fd1bb` | mark, links, focus, testing |
| `--pos` / `--pos-bg` | `#067647` / `#ecfdf3` | `#47cd89` / 10% | launched, growth |
| `--neg` / `--neg-bg` | `#b42318` / `#fef3f2` | `#f97066` / 10% | stopped, errors |
| `--warn` / `--warn-bg` | `#b54708` / `#fffaeb` | `#fdb022` / 10% | proven, scaling |

In Tailwind these are `bg-bg`, `text-ink-2`, `border-line`, `text-pos`, `bg-neg-bg` and so on. Never write a hex value
in a component.

A note that is a fact rather than a failure ("not running Meta ads right now") is ink on a plain card, not red.

## Type

One family: **Inter Variable** (self-hosted, optical sizes, `cv11` and `ss01` on). Jost is for the wordmark only.

| Class | Size / weight | Use |
| --- | --- | --- |
| `.display` | 40–64px / 600, −0.035em, 1.04 | landing headline only |
| `.heading` | 15–28px / 600, −0.02em, 1.2 | page titles (22px), section titles (15px) |
| body | 14px / 400, 1.55 | default; long reads at 13.5–15px |
| `.kicker` | 13px / 500, teal | a label above a landing section |
| `.caption` | 12px, `--ink-3` | metadata, hints, timestamps |
| `.tnum` | tabular figures | every number in a table or KPI |

KPIs are 26px / 600 / tight tracking with a 13px label above and a caption below. Sentence case everywhere, including
buttons and headings.

## Shape and space

- Radius: cards 12px, wells 10px, buttons and inputs 8px (small 7px, large 9px), badges 6px.
- Borders: 1px `--line`. Shadows are barely there (`--shadow-sm` on cards and buttons, `--shadow-lg` only for the
  landing product shot).
- Layout: `.wrap` is 1160px with 24px gutters (16px on phones). App: 248px side nav, content in a single column.
  Sections are 40px apart (`mt-10`), cards in a grid with 12–16px gaps.
- Mobile: no horizontal scroll. Grids use `grid-cols-[minmax(0,1fr)]` so a long word cannot widen a track.

## Components

All in `app/globals.css` under `@layer components`, used as plain classes:

- Buttons: `.btn` + `.btn-primary` (ink, one per view), `.btn-secondary` (outlined), `.btn-ghost`; sizes `.btn-sm`,
  `.btn-lg`. 36px tall by default.
- `.card`, `.well`, `.input`, `.field`, `.sitebox` (the URL box on the landing and setup pages), `.form-error`.
- `.badge` with `-pos`, `-neg`, `-warn`, `-info`, `-outline`. Short words: "New", "Stopped", "Proven", "Testing",
  "Scaling", "No ads".
- `.table` for every list of companies or ads: 13.5px cells, a 12px sentence-case header in `--ink-3` on `--subtle`, 16px cell padding, row hover in
  `--subtle`.
- `.nav-item` for the side nav, `.status-dot` for live state, `.theme-toggle`.
- Ad cards (`components/app/ad-card.tsx`) show the creative, the Page, days running, versions and a stage badge.

## Voice

- Plain and specific. Name the rival, quote the ad, give the number. "Sproos! has run this ad for 485 days", not
  "competitors are leveraging long-running creatives".
- Never invent performance. The Ad Library has no spend or results for commercial ads: say "still running after 60
  days", never "their best performer".
- No hype words: no "unlock", "supercharge", "AI-powered", "magic", "insights at your fingertips".
- Errors say what happened and what to do next, in one or two sentences.

## Sample data

Screenshots, the landing product shot and empty-state examples use invented brands (Clearwell, Tidewell, Marlow,
Fenn, Halo; see `components/sample/`). Never put a real company's name on an invented ad.
