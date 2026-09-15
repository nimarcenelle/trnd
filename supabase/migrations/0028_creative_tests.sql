-- The pick becomes a creative test: a concept the brand can hand to a
-- creator, not a keyword. The search term stays as the research input the
-- concept was found through. Evidence rows say what kind of observation they
-- are, when they were observed and on what sample. Decisions are separate
-- from launches, launches from results, and results from what was learned.
-- Onboarding asks for the context a brief needs (objective, formats, claims).
-- Provider calls are metered per brand. Run after 0027. Idempotent: pasted
-- by hand, safe to re-run. Nothing here rewrites an existing row: a pick
-- written before this migration keeps reading as a keyword pick.

-- --------------------------------------------------------------- picks
alter table public.picks
  add column if not exists concept_title text,
  add column if not exists brief jsonb,
  add column if not exists brief_version text,
  add column if not exists basis text,
  add column if not exists priority_reason text;
alter table public.picks drop constraint if exists picks_basis_check;
alter table public.picks
  add constraint picks_basis_check check (basis is null or basis in ('builds_on','explores'));

-- ------------------------------------------------------------ evidence
-- kind: observation (something seen on a date), quote (a customer's or a
-- rival's own words), measurement (a number with a sample behind it),
-- context (category background). limitation: what the row cannot say.
alter table public.pick_evidence
  add column if not exists kind text not null default 'observation',
  add column if not exists observed_on date,
  add column if not exists sample_size integer,
  add column if not exists limitation text;
alter table public.pick_evidence drop constraint if exists pick_evidence_kind_check;
alter table public.pick_evidence
  add constraint pick_evidence_kind_check check (kind in ('observation','quote','measurement','context'));

-- ------------------------------------------------------------ decisions
-- chosen: picked for production (not launched). refined: rewritten on the
-- owner's direction. running and dismissed keep their meaning.
alter table public.pick_feedback drop constraint if exists pick_feedback_action_check;
alter table public.pick_feedback
  add constraint pick_feedback_action_check check (action in ('running','dismissed','chosen','refined'));
alter table public.pick_feedback drop constraint if exists pick_feedback_reason_check;
alter table public.pick_feedback
  add constraint pick_feedback_reason_check
  check (reason is null or reason in ('wrong_customer','already_tried','off_brand','cant_shoot','not_now','other'));

-- ---------------------------------------------------------------- runs
-- planned: chosen for production, nothing live yet. running: launched.
-- completed / killed: ended, with or without numbers. learned: the owner's
-- own sentence on what the test taught, kept apart from the numbers.
alter table public.pick_runs drop constraint if exists pick_runs_status_check;
alter table public.pick_runs
  add constraint pick_runs_status_check check (status in ('planned','running','completed','killed'));
alter table public.pick_runs
  add column if not exists launched_at timestamptz,
  add column if not exists learned text;

-- ---------------------------------------------------------- businesses
-- What a brief needs that the website cannot say.
alter table public.businesses
  add column if not exists campaign_objective text,
  add column if not exists production_formats text[] not null default '{}'::text[],
  add column if not exists claims_notes text,
  add column if not exists recent_creative_notes text,
  add column if not exists priority_service_id uuid references public.services (id) on delete set null;
alter table public.businesses drop constraint if exists businesses_campaign_objective_check;
alter table public.businesses
  add constraint businesses_campaign_objective_check
  check (campaign_objective is null or campaign_objective in ('purchases','leads','traffic','awareness'));

-- ------------------------------------------------------ provider usage
-- Every paid call outside the model: which provider, how many units, and
-- what that is estimated to cost, by brand and by the job that made it.
-- basis says whether the cents are an estimate from a public rate or a
-- billed figure; the product has no billed figures yet.
create table if not exists public.provider_usage (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references public.businesses (id) on delete cascade,
  provider        text not null,
  operation       text not null,
  units           numeric not null default 0,
  unit_label      text not null default 'calls',
  est_cost_cents  numeric,
  basis           text not null default 'estimate' check (basis in ('estimate','billed')),
  purpose         text not null default 'unknown',
  ok              boolean not null default true,
  note            text,
  created_at      timestamptz not null default now()
);
alter table public.provider_usage enable row level security;
create index if not exists provider_usage_created_idx on public.provider_usage (created_at desc);
create index if not exists provider_usage_business_idx on public.provider_usage (business_id, created_at desc);
drop policy if exists "provider_usage: service only" on public.provider_usage;
create policy "provider_usage: service only" on public.provider_usage
  for all using (false) with check (false);

-- ---------------------------------------------------- pilot applications
-- The founder-assisted pilot's front door. Separate from demo_requests so
-- the old form's rows keep their shape.
create table if not exists public.pilot_applications (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text not null,
  brand_name         text not null,
  website            text,
  monthly_spend      text,
  objective          text,
  runs_meta_ads      boolean,
  production         text,
  what_next          text,
  status             text not null default 'new' check (status in ('new','contacted','accepted','declined')),
  created_at         timestamptz not null default now()
);
alter table public.pilot_applications enable row level security;
create index if not exists pilot_applications_created_idx on public.pilot_applications (created_at desc);
-- Anyone may apply; nobody reads applications from the app (service role only).
drop policy if exists "pilot_applications: insert only" on public.pilot_applications;
create policy "pilot_applications: insert only" on public.pilot_applications
  for insert with check (true);
drop policy if exists "pilot_applications: no read" on public.pilot_applications;
create policy "pilot_applications: no read" on public.pilot_applications
  for select using (false);

-- --------------------------------------------- one week, one transaction
-- replace_week_picks now writes the concept alongside the keyword columns,
-- and the evidence rows' provenance. The ready gate: a pick with a brief
-- needs one evidence row; a pick without one (the older shape) still needs
-- three scripts and one evidence row.
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
    if jsonb_array_length(coalesce(item->'evidence', '[]'::jsonb)) < 1 then
      wanted := 'draft';
    elsif (item->'pick'->'brief') is null or jsonb_typeof(item->'pick'->'brief') <> 'object' then
      if jsonb_array_length(coalesce(item->'scripts', '[]'::jsonb)) < 3 then
        wanted := 'draft';
      end if;
    end if;

    insert into public.picks (
      business_id, opportunity_id, week_of, rank, geo, term, finding,
      metric_label, metric_value, metric_delta_pct, metric_window, sparkline,
      bet_what, bet_budget_usd, bet_duration_days, bet_kill_rule, guardrail,
      grade, grade_score, signal_scores, status,
      concept_title, brief, brief_version, basis, priority_reason
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
      wanted,
      nullif(item->'pick'->>'concept_title', ''),
      case when jsonb_typeof(item->'pick'->'brief') = 'object' then item->'pick'->'brief' else null end,
      nullif(item->'pick'->>'brief_version', ''),
      nullif(item->'pick'->>'basis', ''),
      nullif(item->'pick'->>'priority_reason', '')
    ) returning id into new_id;

    insert into public.pick_evidence (pick_id, signal, claim, source_url, source_label, position, kind, observed_on, sample_size, limitation)
    select new_id, e.value->>'signal', e.value->>'claim',
           nullif(e.value->>'source_url', ''), nullif(e.value->>'source_label', ''), (e.ordinality - 1)::integer,
           coalesce(nullif(e.value->>'kind', ''), 'observation'),
           nullif(e.value->>'observed_on', '')::date,
           nullif(e.value->>'sample_size', '')::integer,
           nullif(e.value->>'limitation', '')
    from jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) with ordinality as e(value, ordinality);

    insert into public.pick_scripts (pick_id, position, variant_label, thesis, hook, beats, direction, cta, duration_seconds)
    select new_id, (s.ordinality - 1)::integer, s.value->>'variant_label', s.value->>'thesis', s.value->>'hook',
           coalesce(s.value->'beats', '[]'::jsonb),
           case when jsonb_typeof(s.value->'direction') = 'object' then s.value->'direction' else null end,
           s.value->>'cta', (s.value->>'duration_seconds')::integer
    from jsonb_array_elements(coalesce(item->'scripts', '[]'::jsonb)) with ordinality as s(value, ordinality);

    return next new_id;
  end loop;
end;
$$;
