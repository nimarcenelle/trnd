-- What the last pull from each source found for a rival, so the app can say
-- plainly what was read, when, and what failed:
-- { ads: { at, ok, count, via, note }, site: { at, ok, count, note } }. Safe to re-run.
alter table public.rivals add column if not exists health jsonb;
