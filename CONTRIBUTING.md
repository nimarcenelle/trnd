# Contributing to TRND

Setup lives in the [README](README.md) — clone, `pnpm install`, `pnpm seed`, `pnpm dev`.
This file covers the things the README doesn't: access, credentials, and what's expected
of a change before it lands.

## Getting access

The repo is public, so you can clone and fork without asking. **Pushing branches needs a
collaborator invite** (Settings → Collaborators). Without one, work from a fork and open
pull requests across.

## You do not need any credentials to start

With no env vars at all, TRND runs in a loudly-labeled demo mode: a seeded local store in
`.demo-data/`, local password accounts, and a deterministic campaign generator. Every
screen works end to end. Start here — it's the fastest way to get oriented, and most
changes never need a real key.

Each integration switches on independently the moment its env var lands, with no code
changes. The README's [demo-vs-real table](README.md#demo-mode-vs-real-mode) says which
var turns on what, and `GET /api/health` reports which mode each subsystem is in.

### Credential rules

- `.env*` is gitignored except `.env.example`. **Never commit `.env.local`.** If you add
  a new setting, add the key to `.env.example` with an empty value and a comment saying
  where to get it — never the value itself.
- Provision your own keys for anything metered or personal. The paid per-result ones
  (`APIFY_TOKEN`, `X_BEARER_TOKEN`) and anything Stripe spend real money, so don't point
  them at shared or production accounts while developing.
- Use Stripe test-mode keys, never a live one. The webhook endpoint is
  `POST /api/stripe/webhook`; `stripe listen --forward-to` is the usual way to get a
  local `STRIPE_WEBHOOK_SECRET`.
- Supabase work needs the migrations applied first: run `supabase/migrations/` in order,
  or `supabase db push`.

## Branches and commits

Branch off `main` as `feat/<short-kebab-slug>` or `fix/<short-kebab-slug>`.

Commit subjects use a `feat:`/`fix:` prefix, then state what is now true in lowercase
plain language — not an imperative. The existing log is the reference:

```
feat: the demand score runs on every surface, not one
fix: a moment that has already passed cannot be an opportunity
```

Pull requests merge into `main` with a merge commit.

## Before you push

**There is no CI.** Nothing runs these for you, so a broken push stays broken until
someone notices. Run them locally:

```bash
pnpm lint
pnpm test        # vitest — every signal parser has fixtures; add one with your parser
pnpm build       # TS is strict; type errors only surface here
```

`pnpm test:e2e` drives the full Playwright path (signup → onboarding → recommendation →
campaign → launch → results → learnings). Run it for anything touching those screens.

## Things that look arbitrary but aren't

- **Amber means opportunity and the one primary action. Mint means measured reality.
  Ink-faint means the old way.** They carry meaning — don't reach for them as a palette.
- **`lib/scoring.ts` is the whole opportunity formula, deliberately in one file.** Tune it
  there rather than scattering weights across call sites.
- **`lib/db/` is one `Repo` interface with `supabase/` and `demo/` implementations.** Both
  have to keep working; a feature that only works with Supabase breaks demo mode.
- **`lib/ai/gemini.ts` is the only file that imports the model SDK.** Prompts are versioned
  and outputs Zod-validated, with a fallback on violation. Keep that seam intact.
- **Recommendation fit never depends on an API key.** The deterministic concept judge in
  `lib/recommend/relevance.ts` gates every ranking so a BBQ smokehouse is never told to
  advertise espresso martinis. The Gemini judge only refines that read.
- **Next.js 16 diverges from what's widely documented.** Per [AGENTS.md](AGENTS.md), check
  `node_modules/next/dist/docs/` before reaching for a familiar API.

## Where the context is

| File | What it holds |
|---|---|
| `TRND-BUILD-BRIEF.md` | Full product brief |
| `PRODUCT.md` | Product surface and screens |
| `DECISIONS.md` | Judgment calls and why |
| `BUILD_LOG.md` | Chronological build record |
| `BLOCKED.md` | Integrations awaiting credentials, and the seam to make each real |
| `DATA-INVENTORY.md` | What data exists and where |
| `GO-LIVE.md` | Launch checklist |
| `design/` | Visual references |

If you're picking up something half-finished, `BLOCKED.md` is usually the honest answer
for why it's stubbed.
