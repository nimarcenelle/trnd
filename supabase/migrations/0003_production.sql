-- Production readiness: email preferences, a once-only trial reminder, and backoff for failing reads. Safe to re-run; paste into the Supabase SQL editor.

-- The weekly plan email can be turned off, from Settings or the link in the email itself.
alter table public.creators add column if not exists email_plans boolean not null default true;
-- The trial end the reminder was sent for: Stripe redelivers events, and a second copy sends nothing.
alter table public.creators add column if not exists trial_reminder_for timestamptz;
-- Failed reads in a row: the daily read backs off an account that keeps failing (a deleted or private handle).
alter table public.creators add column if not exists scan_failures int not null default 0;
