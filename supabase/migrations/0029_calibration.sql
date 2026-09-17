-- The calibration log: every finished run keeps the account click-through it
-- was judged against and its lift over it, so "A picks win more than B
-- picks" is checked against results rather than asserted. Run after 0028.
-- Idempotent: pasted by hand, safe to re-run.

-- baseline_ctr: the brand's impression-weighted click-through across its ad
-- history when the run ended, with the run's own row left out. Frozen on
-- the run so the comparison never drifts as the account's history grows.
-- lift: the run's click-through over baseline_ctr; 1.3 means 30% above.
alter table public.pick_runs
  add column if not exists baseline_ctr numeric,
  add column if not exists lift numeric;
