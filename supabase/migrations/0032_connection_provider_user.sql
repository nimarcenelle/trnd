-- The platform user behind a connection. Meta's deauthorize and data-deletion
-- callbacks (app/api/connect/meta/deauthorize, app/api/connect/meta/data-deletion)
-- name the app-scoped user id, not the ad account, so the row is found by it.
-- Run after 0031. Idempotent: pasted by hand, safe to re-run.

alter table public.connections
  add column if not exists provider_user_id text;

create index if not exists connections_provider_user_idx
  on public.connections (provider, provider_user_id);
