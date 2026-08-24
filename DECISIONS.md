# DECISIONS

One line each: what was decided and why, per Overnight Protocol §3.1.

- **Branch name**: the brief says `feat/mvp-overnight`; this cloud session has a
  harness-designated branch `claude/new-session-04s7aw` and a hard rule against pushing
  elsewhere. All work is on `claude/new-session-04s7aw`. Same content, different label.
- **Next.js 16.3.2** (brief says 15+): `create-next-app@latest` resolved to 16; it
  satisfies "15+" and avoids pinning an older major. Note: `middleware.ts` is deprecated
  in 16 — the convention is `proxy.ts`.
- **Fonts via `<link>` stylesheet, not `next/font`**: `next/font` downloads font files at
  build time; this build environment has no route to Google Fonts, and the reference
  landing page already uses the stylesheet approach. Every family has a real fallback.
- **GRWM Gemini key hunt abandoned**: the session's permission layer denies scanning
  another repo for API keys (see BLOCKED.md). Gemini runs behind `lib/ai` with a
  deterministic fallback generator until `GEMINI_API_KEY` lands in `.env.local`.
- **Demo mode data layer**: no Supabase credentials and no Docker daemon for a local
  stack (see BLOCKED.md). The database is NOT silently swapped — when Supabase env vars
  are absent the app boots in a loudly-labeled demo mode backed by a seeded local store,
  behind the same repository interface the Supabase implementation fulfills.
- **Trends interest-over-time without the `google-trends-api` package**: the package is
  unmaintained and wraps the same unofficial widget endpoints; implemented directly with
  our own retry + fast-tripping circuit breaker (`lib/signals/adapters/trends-iot.ts`).
- **`matchSignalsToBusiness` is deterministic, not a Gemini call**: §8 mandates a
  transparent, tunable scoring formula with a plain-English rationale; a model call
  there would contradict it. Gemini handles the two creative calls (angle, assets);
  Flash is resolved and ready if a re-rank call is wanted later. Nick may disagree —
  flagged in the Morning Report.
- **`angle_type` lives inside `campaigns.audience` (jsonb)**: the learnings loop needs
  the persuasion shape per campaign; a typed optional field in the audience JSON avoids
  a schema migration and stays queryable. Promote to a column when the Meta sync lands.
- **Landing ticker/hero/flywheel infinite animations start on first user input**: keeps
  slow-device first paint stable (and Lighthouse honest); one-shot intro animations
  still play on load. Reduced-motion users never see motion either way.
- **`main` bootstrapped at the scaffold commit**: the repo was empty (no default
  branch), and a PR needs a base with shared history. `main` points at the first
  commit only; all product work arrives via the PR from the designated branch.
