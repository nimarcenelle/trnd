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
