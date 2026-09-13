-- The pick page rebuild. A pick ends at "here is the ad, here is the bet,
-- here is when to kill it": a finding, one metric, a bet with a kill rule,
-- three finished scripts, an optional guardrail, and the evidence behind it
-- by signal. Everything is written upstream by the weekly job, so the list
-- and detail pages read rows and never call a model.
--
-- Columns are business_id (not brand_id) to match every other table and the
-- owns_business() policy helper. Idempotent: pasted by hand, safe to re-run.

-- ------------------------------------------------------------------ picks
create table if not exists public.picks (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  opportunity_id     uuid references public.opportunities (id) on delete set null,
  week_of            date not null,
  rank               integer not null check (rank between 1 and 5),
  geo                text not null default 'US',
  term               text not null,
  finding            text not null,
  metric_label       text not null,
  metric_value       numeric,
  metric_delta_pct   numeric,
  metric_window      text not null check (metric_window in ('week','30d')),
  sparkline          jsonb not null default '[]'::jsonb,
  bet_what           text not null,
  bet_budget_usd     numeric not null,
  bet_duration_days  integer not null,
  bet_kill_rule      text not null,
  guardrail          text,
  -- The Opportunity Grade at generation time, kept on the pick so the page
  -- and the later weight regression both read what the brand was shown.
  grade              text check (grade in ('A+','A','B+','B','C','Hold')),
  grade_score        numeric,
  signal_scores      jsonb not null default '{}'::jsonb,
  status             text not null default 'draft' check (status in ('draft','ready','published')),
  created_at         timestamptz not null default now()
);
alter table public.picks
  add column if not exists grade text,
  add column if not exists grade_score numeric,
  add column if not exists signal_scores jsonb not null default '{}'::jsonb;
alter table public.picks enable row level security;
create index if not exists picks_business_week_idx on public.picks (business_id, week_of, rank);
drop policy if exists "picks: via business" on public.picks;
create policy "picks: via business" on public.picks
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ----------------------------------------------------------- pick_evidence
create table if not exists public.pick_evidence (
  id            uuid primary key default gen_random_uuid(),
  pick_id       uuid not null references public.picks (id) on delete cascade,
  signal        text not null check (signal in ('customer','culture','competitive','brand')),
  claim         text not null,
  source_url    text,
  source_label  text,
  position      integer not null default 0
);
alter table public.pick_evidence enable row level security;
create index if not exists pick_evidence_pick_idx on public.pick_evidence (pick_id, position);
drop policy if exists "pick_evidence: via pick" on public.pick_evidence;
create policy "pick_evidence: via pick" on public.pick_evidence
  for all using (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)))
  with check (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)));

-- ------------------------------------------------------------ pick_scripts
create table if not exists public.pick_scripts (
  id                uuid primary key default gen_random_uuid(),
  pick_id           uuid not null references public.picks (id) on delete cascade,
  position          integer not null default 0,
  variant_label     text not null,
  thesis            text not null,
  hook              text not null,
  beats             jsonb not null default '[]'::jsonb,
  cta               text not null,
  duration_seconds  integer not null check (duration_seconds between 5 and 180)
);
alter table public.pick_scripts enable row level security;
create index if not exists pick_scripts_pick_idx on public.pick_scripts (pick_id, position);
drop policy if exists "pick_scripts: via pick" on public.pick_scripts;
create policy "pick_scripts: via pick" on public.pick_scripts
  for all using (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)))
  with check (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)));

-- ----------------------------------------------------------- pick_feedback
create table if not exists public.pick_feedback (
  id           uuid primary key default gen_random_uuid(),
  pick_id      uuid not null references public.picks (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  action       text not null check (action in ('running','dismissed')),
  reason       text check (reason in ('wrong_customer','already_tried','off_brand','cant_shoot','other')),
  note         text,
  created_at   timestamptz not null default now()
);
alter table public.pick_feedback enable row level security;
create index if not exists pick_feedback_business_idx on public.pick_feedback (business_id, created_at desc);
drop policy if exists "pick_feedback: via business" on public.pick_feedback;
create policy "pick_feedback: via business" on public.pick_feedback
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- --------------------------------------------------------------- pick_runs
create table if not exists public.pick_runs (
  id                uuid primary key default gen_random_uuid(),
  pick_id           uuid not null references public.picks (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  status            text not null default 'running' check (status in ('running','completed','killed')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  spend_usd         numeric,
  result_note       text,
  meta_campaign_id  text  -- reserved for the ad-account integration
);
alter table public.pick_runs enable row level security;
create index if not exists pick_runs_business_idx on public.pick_runs (business_id, started_at desc);
drop policy if exists "pick_runs: via business" on public.pick_runs;
create policy "pick_runs: via business" on public.pick_runs
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- --------------------------------------------- one week, one transaction
-- The weekly job writes a business's picks, their evidence and their scripts
-- in one call. A function body is one transaction: either the whole week
-- lands or none of it does. Picks someone already acted on (a run or a
-- dismissal) are kept; the rest of the week is replaced. The ready gate is
-- enforced here too: a pick without three scripts and one evidence row is a
-- draft whatever the caller asked for.
create or replace function public.replace_week_picks(p_business_id uuid, p_week_of date, p_picks jsonb)
returns setof uuid
language plpgsql
as $$
declare
  item jsonb;
  new_id uuid;
  wanted text;
begin
  delete from public.picks p
  where p.business_id = p_business_id
    and p.week_of = p_week_of
    and not exists (select 1 from public.pick_runs r where r.pick_id = p.id)
    and not exists (select 1 from public.pick_feedback f where f.pick_id = p.id);

  for item in select * from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    wanted := coalesce(item->'pick'->>'status', 'draft');
    if jsonb_array_length(coalesce(item->'scripts', '[]'::jsonb)) < 3
       or jsonb_array_length(coalesce(item->'evidence', '[]'::jsonb)) < 1 then
      wanted := 'draft';
    end if;

    insert into public.picks (
      business_id, opportunity_id, week_of, rank, geo, term, finding,
      metric_label, metric_value, metric_delta_pct, metric_window, sparkline,
      bet_what, bet_budget_usd, bet_duration_days, bet_kill_rule, guardrail,
      grade, grade_score, signal_scores, status
    ) values (
      p_business_id,
      nullif(item->'pick'->>'opportunity_id', '')::uuid,
      p_week_of,
      (item->'pick'->>'rank')::integer,
      coalesce(item->'pick'->>'geo', 'US'),
      item->'pick'->>'term',
      item->'pick'->>'finding',
      item->'pick'->>'metric_label',
      nullif(item->'pick'->>'metric_value', '')::numeric,
      nullif(item->'pick'->>'metric_delta_pct', '')::numeric,
      item->'pick'->>'metric_window',
      coalesce(item->'pick'->'sparkline', '[]'::jsonb),
      item->'pick'->>'bet_what',
      (item->'pick'->>'bet_budget_usd')::numeric,
      (item->'pick'->>'bet_duration_days')::integer,
      item->'pick'->>'bet_kill_rule',
      nullif(item->'pick'->>'guardrail', ''),
      nullif(item->'pick'->>'grade', ''),
      nullif(item->'pick'->>'grade_score', '')::numeric,
      coalesce(item->'pick'->'signal_scores', '{}'::jsonb),
      wanted
    ) returning id into new_id;

    insert into public.pick_evidence (pick_id, signal, claim, source_url, source_label, position)
    select new_id, e.value->>'signal', e.value->>'claim',
           nullif(e.value->>'source_url', ''), nullif(e.value->>'source_label', ''), (e.ordinality - 1)::integer
    from jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) with ordinality as e(value, ordinality);

    insert into public.pick_scripts (pick_id, position, variant_label, thesis, hook, beats, cta, duration_seconds)
    select new_id, (s.ordinality - 1)::integer, s.value->>'variant_label', s.value->>'thesis', s.value->>'hook',
           coalesce(s.value->'beats', '[]'::jsonb), s.value->>'cta', (s.value->>'duration_seconds')::integer
    from jsonb_array_elements(coalesce(item->'scripts', '[]'::jsonb)) with ordinality as s(value, ordinality);

    return next new_id;
  end loop;
end;
$$;
