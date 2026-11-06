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
  figures in `lib/admitted/odds-core.ts`; the model only words the fixes. The homepage samples in
  `components/admitted/sample.ts` must match what the live tool returns for those applicants.
- **Essay scores are calculated.** A model grades six criteria on described bands, three reads averaged, in
  `lib/admitted/review-core.ts`. Every line a review cites must exist in the essay. A rewrite that scores lower than its
  draft gets one more try. Every rewrite is shown with its score change, green only when the score rose. Before a rewrite the student can answer the review's fixes; those answers count as their own material.
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

- The landing page: a left-aligned hero (pill naming the audience, headline, one-line sub, one button into `/odds`) on faint
  graph paper (`.dot-grid`), beside a working sample where flipping a fix changes the odds (`odds-toy.tsx`). Then the covered
  schools with "Request a school", the product in a browser frame, four numbered "How it works" columns on hairlines,
  alternating text/card feature rows with green checks, each card on a tinted panel (`.stage`), **exactly one** deep navy
  rounded band ("Where the numbers come from", with a sample number traced to its Common Data Set sections), free and paid
  pricing cards, plus-accordion FAQ, minimal footer.
- `/odds` is one question per screen: schools, GPA, score, home state. Then the odds, then one sell screen  Nothing asks for an email before the odds, and the essay workspace stays side by side. Questions use `.display`
  and a large `.flow-input`, "Your file" fills in beside them on desktop, the odds land on one big number, and the price sits on the navy band color.
- Public page numbers: percent odds per school and +N points on the application round only. Nobody can size an essay, a letter
  or an activity list without reading it, so those say "depends on what's in them", never a number. The essay score lives
  inside the paid workspace, after we have read the draft. "Up to" is today's odds plus the round only, and blank where a
  school has no early round.
- Pricing: odds free; essays $9.99 a week, cancel anytime, no refunds promised. The free giveaway is the guide PDF "The 7 mistakes that sink
  college essays" (`public/guides/`, source in `content/guide/essay-mistakes.html`), for an email. It's framed around
  mistakes, because the problem sells the tool, and its last page says why you can't catch them in your own draft. Admitted is described as an AI tool that rates and
  improves essays, never as a person reading them.
- Only sell what exists. A feature joins the page and the price list when it ships.
- The essay page is a workspace, not a marketing page: its own slim bar, the draft on the left with cited lines marked, results
  on the right.
- Cards 12px radius, wells 10px, the band 20px. `.wrap` is 1160px. No horizontal scroll on phones.

## Voice

- Short declaratives. "36% of this is locked. 64% is movable." Not "unlock your dream school".
- Give the number and its unit: "+7 pts at Dartmouth", "chance of at least one admit: 16% → 23%".
- Never promise an admit. Odds say how sure they are.
- No hype words: no "unlock", "supercharge", "AI-powered", "magic", "dream school", "guaranteed".
