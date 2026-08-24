# BUILD LOG

Chronological. Newest at the bottom. See DECISIONS.md and BLOCKED.md for the why.

## Recon (07:00 UTC)
- Repo was completely empty (no commits, no `main`). Node 22, pnpm 10 available.
- Egress: registry.npmjs.org allowed; trends.google.com / reddit.com / news.google.com
  denied by network policy → live ingestion blocked in this container (BLOCKED.md).
- No Docker daemon → no local Supabase stack; no Supabase env vars (BLOCKED.md).
- GRWM cloned; key extraction denied by the permission layer (BLOCKED.md).

## Milestone 1 — Scaffold (07:07 UTC)
- Next.js 16.3.2, App Router, TS strict, Tailwind v4, pnpm. Vitest wired (`pnpm test`).
- Full token system from the brief in `app/globals.css` — both themes, `@theme` mapping
  for Tailwind utilities, shared primitives (btn/pill/eyebrow/card/field/skeleton).
- `/styleguide` renders every color token, type ramp, buttons, pills, cards, fields in
  both themes; `components/theme-toggle.tsx` follows the OS and persists an override
  (pre-paint init script in the root layout, no flash).
- Design references checked in under `design/`; brief at `TRND-BUILD-BRIEF.md`.
- `pnpm build`, `pnpm lint`, `pnpm test`: all green.

## Milestone 2 — Data layer (07:16 UTC)
- `supabase/migrations/0001_init.sql`: full §7 schema + demo_requests. RLS on every
  table; ownership via `owns_business()`; signals/series/learnings are shared reads,
  cron-only writes; signal daily dedupe via expression unique index.
- `lib/db`: one `Repo` interface, two implementations — Supabase (RLS/service-role) and
  demo store (`.demo-data/store.json`) that enforces the same ownership rules in code.
- `pnpm seed`: 58 illustrative signals across all seven categories (source='seed'),
  1,740 sparkline series points, 8 learning priors. Verified counts by running it.
- Tests: static RLS coverage over migrations, demo-repo cross-business read/write
  blocking, signal dedupe, env-gated live Supabase RLS test (skips loudly — BLOCKED.md).
- build/lint/test green.

## Milestone 3 — Auth + onboarding (07:20 UTC)
- Mode-agnostic session API (`lib/auth/session.ts`): Supabase Auth (password + magic
  link + /auth/callback code exchange) when configured; demo mode uses scrypt-hashed
  local accounts and an HMAC-signed cookie. `proxy.ts` (Next 16's middleware) refreshes
  Supabase sessions; pass-through in demo mode.
- /login, /signup styled per the design system; magic-link button explains itself in
  demo mode instead of pretending to send mail.
- /onboarding: 5-step wizard (name → category → location+radius+price band → services &
  prices → brand voice), single server action writes businesses + services, cannot be
  skipped — /app layout redirects to it until a business exists.
- /app shell: sticky nav, business name, sign out, and a visible DEMO MODE banner when
  Supabase isn't configured.
- Verified against the prod server: /login 200, /signup 200, /app → 307 /login.
- build/lint/test green.

## Milestone 4 — Landing page port (07:35 UTC)
- `design/trnd-landing.html` ported to React: sticky nav + theme toggle, scrolling signal
  ticker, animated hero signal→ad-card SVG, old way / TRND way split, interactive
  five-step explainer, signal proof cards, flywheel (CSS-driven spin, honors
  reduced-motion), roadmap, pricing band, demo request form, footer with the
  "illustrative" disclosure.
- Demo form posts a server action into the real `demo_requests` table (demo store when
  Supabase is absent). Reveal-on-scroll is opt-in via JS with a visible-by-default
  fallback, exactly like the reference.
- Caught a stale prod server process serving an old build (looked like landing.css was
  lost); after killing it, verified both themes via headless Chromium screenshots.
- build/lint/test green.
