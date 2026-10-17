-- A scan runs in stages (ads, tag, report), each inside its own function
-- invocation when the previous one runs out of time. scan_state remembers
-- where a scan is, so the next invocation resumes rather than restarts, and
-- the report stage can find this scan's changes. Safe to re-run.
alter table public.brands add column if not exists scan_state jsonb;
