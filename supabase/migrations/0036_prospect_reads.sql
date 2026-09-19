-- The free account read: a prospect's brand, read the way a customer's is
-- (site, catalog, founding analysis, rivals, the strategist pass) into a
-- shadow business the founder owns, so the teardown email can quote it.
-- A prospect business never gets a week, an email or a cron read. Run
-- after 0035. Idempotent: pasted by hand, safe to re-run.
alter table public.businesses add column if not exists prospect boolean not null default false;
create index if not exists businesses_prospect_idx on public.businesses (prospect) where prospect;
