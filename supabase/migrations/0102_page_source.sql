-- How a rival's Facebook Page was settled: 'checked' (found and confirmed
-- against its ads) or 'owner' (pasted by the owner). Null means matched before
-- this column existed, so the next scan checks it once. Safe to re-run.
alter table public.rivals add column if not exists page_source text;
