# Admitted

Tells college applicants their real admit odds at each school, splits every number into the part their stats already
decided ("locked") and the part their application can still change ("movable"), and then does the movable part: rewrites
the essay from their own draft, rebalances the college list, and sets the ED/EA/RD plan. Undergrad first; MBA, law and
med run on the same engine with different inputs and are exposed as tracks.

Odds come from public data (each college's published Common Data Set), so every number is checkable.

## Funnel

1. **Free, no account:** GPA + SAT/ACT + a list of schools → odds per school, the locked/movable split, and the single top
   fix named.
2. **Paid, one price per cycle:** the fixes done: essay rewrites (unlimited revisions), a rebalanced list, an ED/EA/RD
   plan, unlimited re-runs through the cycle.

## This branch

Admitted is a product fork of TRND, the way `creators` is: it shares the repo, the stack (Next 16, Tailwind 4, Supabase)
and the component system, and deploys as its own Vercel project at `admitted.usetrnd.com` (`NEXT_PUBLIC_SITE_URL`).

In scope so far:

- **Landing page** (`app/page.tsx`).
- **App shell mockup** (`components/admitted/product-shot.tsx`): Odds · Essays · College list · Deadlines, clickable,
  with ranked next moves. Sample applicant and invented schools in `components/admitted/sample.ts`.

Not yet: auth, payments, real data, the odds engine. The hero's odds box says the free odds open on `[LAUNCH DATE]`.
TRND's app routes (`/app`, `/login`, `/signup`, the scan crons) are still in the tree from the fork and are not linked
from the Admitted pages; replace or remove them when the Admitted app is built.

Brand and voice: `BRAND.md`.

## Develop

```
pnpm install
pnpm dev
```
