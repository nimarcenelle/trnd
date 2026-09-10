-- Prospector fit signals: Google rating / review count and distance from the
-- search center ride along with each lead so the fit score can use them.
-- The store tolerates these columns being absent (it retries without them),
-- so a deploy ahead of this migration still saves leads — just unscored on
-- these three inputs.

alter table public.prospect_leads
  add column if not exists rating         numeric(2,1),
  add column if not exists review_count   integer,
  add column if not exists distance_miles numeric(6,1);
