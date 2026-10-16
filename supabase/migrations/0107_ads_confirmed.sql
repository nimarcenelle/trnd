-- When a rival's "no active Meta ads" was last confirmed by the full search
-- (its Page's past ads, the Ad Library under its name, domain and handle, and
-- the model's look at the advertisers found), so the check runs every few
-- days rather than every scan. Safe to re-run.
alter table public.rivals add column if not exists ads_confirmed_at timestamptz;
