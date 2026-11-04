# Admitted: brand

How Admitted looks and talks. Any new UI follows it. Forked from TRND's brand: same type, same components, same
restraint, on a warm ground with a muted green. The source of truth for values is `app/globals.css` (tokens and
component classes) and `components/brand.tsx` (the wordmark). If this file and those disagree, fix whichever is wrong in
the same change.

## Principles

- **Financial-grade, not salesy.** A calm tool for a decision that feels bigger than money. Numbers first; the product
  itself does the convincing. If it would look at home on a crypto or AI-template landing page, it is wrong.
- **The split is the idea.** Every odds number can be shown as locked (ink) and movable (green). Keep that pairing
  everywhere: the bar, the legend, the KPI tiles.
- **Color only where it means something.** Green (`--brand`): the movable part, points gained, a fix that is ready,
  check bullets. Ink (`--locked`): the locked part. Amber: a deadline. Red: an error. Never decoration.
- **No pressure.** No countdown timers, testimonial walls, urgency banners or "spots left". The product never scolds;
  it quantifies and offers the fix.
- **Checkable.** Every number points at its source (the college's Common Data Set). Never invent a number about a real
  college; samples use invented schools (Hollis, Calder, Wrenfield, Marrow, Ashby, Linden State;
  `components/admitted/sample.ts`). Where a real figure does not exist yet, write a literal placeholder: `[X]`, `[PRICE]`.
- **Light by default**, with a dark theme from the toggle (`[data-theme="dark"]`).

## Wordmark

`components/brand.tsx`: a muted-green dot (0.46× the type size) and **Admitted** in Inter 600, −0.02em, in ink. Never
recolored except ink on light and ink on dark. Minimum size 13px.

## Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#f7f5f0` | `#0d0d0c` | page background (warm off-white) |
| `--bg` | `#ffffff` | `#141413` | cards, inputs |
| `--subtle` | `#f9f8f5` | `#191917` | alternate sections, wells, table headers |
| `--muted` | `#efede7` | `#21211e` | hover, empty bar track |
| `--line` / `--line-strong` | `#e6e3db` / `#d5d1c6` | `#2a2a26` / `#3a3934` | hairlines / inputs |
| `--ink` / `--ink-2` / `--ink-3` | `#111110` / `#4f4d47` / `#85827a` | `#eeede8` / `#a8a69f` / `#75736c` | text |
| `--brand` | `#3d6b4f` | `#8fbf9c` | movable, points gained, checks, kicker |
| `--locked` | `#2b2a27` | `#d9d7cf` | the locked part of a split |
| `--pos` / `--warn` / `--neg` (+ `-bg`) | | | ready / deadline / error pills |
| `--band`, `--band-2`, `--band-line`, `--band-ink`, `--band-ink-3` | `#121211` … | | the one dark proof band |

In Tailwind: `bg-ground`, `bg-band`, `bg-locked`, `text-brand` and so on. Never write a hex value in a component.

## Type

One family: **Inter Variable**. `.display` (600, −0.035em) for the hero headline only, two lines. `.section-title`
(500, −0.03em) for section headings; inside the dark band it drops to 400. Big stats are plain numbers (40–60px, 400–500,
−0.04em) with a small muted label beneath, no boxes or icons around them unless they sit in the band's tiles. `.tnum`
on every number. Sentence case everywhere.

## Layout

- The landing page follows TRND's: pill tag, two-line headline, one-line sub, the inline odds box, then the product in
  a browser frame (side nav · view · ranked next moves). Stats row, four numbered "How it works" columns on hairlines,
  alternating text/card feature rows with green checks, quiet grey track cards, **exactly one** near-black rounded band
  ("Where the numbers come from"), one pricing card, plus-accordion FAQ, minimal footer.
- Cards 12px radius, wells 10px, the band 20px. `.wrap` is 1160px. No horizontal scroll on phones.

## Voice

- Short declaratives. "64% of this is locked. 36% is movable." Not "unlock your dream school".
- Give the number and its unit: "+8 pts at Calder", "chance of at least one admit: 91% → 98%".
- Never promise an admit. Odds say how sure they are.
- No hype words: no "unlock", "supercharge", "AI-powered", "magic", "dream school", "guaranteed".
