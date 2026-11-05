# Admitted: brand

How Admitted looks and talks. Any new UI follows it. Forked from TRND's brand: same type, same components, same
restraint, on a white ground with navy ink and one clear green. The source of truth for values is `app/globals.css` (tokens and
component classes) and `components/brand.tsx` (the wordmark). If this file and those disagree, fix whichever is wrong in
the same change.

## Principles

- **Financial-grade, not salesy.** A calm tool for a decision that feels bigger than money. Numbers first; the product
  itself does the convincing. If it would look at home on a crypto or AI-template landing page, it is wrong.
- **The split is the idea.** Every odds number can be shown as locked (ink) and movable (green). Keep that pairing
  everywhere: the bar, the legend, the KPI tiles.
- **Color where it means something.** Green (`--brand`): the movable part, points gained, a fix that is ready, check
  bullets, the second line of the hero headline. Navy (`--locked`, `--action`): the locked part, primary buttons, the data
  band. Amber: a deadline. Red: an error. Beyond those, the only decoration is the soft navy wash behind the hero and the
  closing call to action (`.wash-top`, `.wash-bottom`).
- **Not beige.** Neutrals lean cool, toward navy, never yellow or tan.
- **No pressure.** No countdown timers, testimonial walls, urgency banners or "spots left". The product never scolds;
  it quantifies and offers the fix.
- **Checkable.** Every school figure comes from that school's own Common Data Set and points at its section. Odds are calculated from those
  figures in `lib/admitted/odds-core.ts`; the model only words the fixes. The homepage sample in
  `components/admitted/sample.ts` must match what the live tool returns for GPA 3.95, SAT 1530.
- **Light by default**, with a dark theme from the toggle (`[data-theme="dark"]`).

## Wordmark

`components/brand.tsx`: a green dot (0.46× the type size) and **Admitted** in Inter 600, −0.02em, in ink. Never
recolored except ink on light and ink on dark. Minimum size 13px.

## Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#ffffff` | `#0b1220` | page background |
| `--bg` | `#ffffff` | `#111a2b` | cards, inputs |
| `--subtle` | `#f5f7fa` | `#141e31` | alternate sections, wells, table headers |
| `--muted` | `#e9edf3` | `#1d2940` | hover, empty bar track |
| `--line` / `--line-strong` | `#e2e7ee` / `#cbd3df` | `#263349` / `#36455f` | hairlines / inputs |
| `--ink` / `--ink-2` / `--ink-3` | `#101b30` / `#45516a` / `#68738a` | `#eef2f8` / `#a9b4c6` / `#7d8aa0` | text |
| `--brand` | `#0e7c4f` | `#4fd08f` | movable, points gained, checks |
| `--locked` | `#14233f` | `#dbe3ef` | the locked part of a split |
| `--action` / `--on-action` | `#14233f` / `#ffffff` | `#e8edf6` / `#101b30` | primary button / text on it |
| `--kicker`, `--soft`, `--soft-ink` | `#2b4a80` … | `#8fa8d6` … | section kickers, the pill and step numbers |
| `--pos` / `--warn` / `--neg` (+ `-bg`) | | | ready / deadline / error pills |
| `--band`, `--band-2`, `--band-line`, `--band-ink`, `--band-ink-3` | `#101f3b` … | `#15233f` … | the one deep navy proof band |

In Tailwind: `bg-ground`, `bg-band`, `bg-locked`, `text-brand` and so on. Never write a hex value in a component.

## Type

One family: **Inter Variable**. Fixed roles, one size each: `.display` for the hero headline, `.section-title` at
32/40px for every section heading, 40px semibold for stats, 16px for body, and 11, 12, 13 and 14px for labels and product
UI. Do not add sizes between these. `.tnum` on every number. Sentence case everywhere.

## Layout

- The landing page: a left-aligned hero (pill naming the audience, headline, one-line sub, the inline odds box) on
  faint graph paper (`.dot-grid`), beside a working sample where flipping a fix changes the odds (`odds-toy.tsx`). Then the
  product in a browser frame (side nav · view · ranked next moves), four numbered "How it works" columns on hairlines,
  alternating text/card feature rows with green checks, each card on a tinted panel (`.stage`), **exactly one** deep navy
  rounded band ("Where the numbers come from", with a sample number traced to its Common Data Set sections), one pricing
  card, plus-accordion FAQ, minimal footer.
- Cards 12px radius, wells 10px, the band 20px. `.wrap` is 1160px. No horizontal scroll on phones.

## Voice

- Short declaratives. "36% of this is locked. 64% is movable." Not "unlock your dream school".
- Give the number and its unit: "+7 pts at Dartmouth", "chance of at least one admit: 16% → 23%".
- Never promise an admit. Odds say how sure they are.
- No hype words: no "unlock", "supercharge", "AI-powered", "magic", "dream school", "guaranteed".
