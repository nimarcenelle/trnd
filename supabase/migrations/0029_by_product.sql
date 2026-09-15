-- Concepts belong to a product and say whether this week is pushing them.
-- A timely concept has evidence pointing at it this week and expires with
-- the week; an evergreen one is the ad TRND would make for the product
-- anyway and stays until the brand acts on it. Writes are additive: a
-- concept a brand has read keeps its id, and later reads only add evidence
-- or fill an empty slot. Run after 0028. Idempotent: pasted by hand, safe
-- to re-run.

-- --------------------------------------------------------------- picks
alter table public.picks
  add column if not exists service_id uuid references public.services (id) on delete set null,
  add column if not exists timing text,
  add column if not exists angle text,
  add column if not exists expires_on date;
alter table public.picks drop constraint if exists picks_timing_check;
alter table public.picks
  add constraint picks_timing_check check (timing is null or timing in ('timely','evergreen'));
alter table public.picks drop constraint if exists picks_angle_check;
alter table public.picks
  add constraint picks_angle_check
  check (angle is null or angle in ('problem_first','comparison','demo','objection','social_proof','education'));
create index if not exists picks_business_open_idx on public.picks (business_id, status, timing, expires_on);

-- ---------------------------------------------------------- businesses
-- Which products to brief for. Empty means every active one, capped.
alter table public.businesses
  add column if not exists brief_service_ids uuid[] not null default '{}'::uuid[];

-- ----------------------------------------------------- additive writes
-- Same row shape as replace_week_picks, but nothing is deleted first: the
-- week job uses this after the first write, so a concept already on the
-- page keeps its id and its runs.
create or replace function public.insert_week_picks(p_business_id uuid, p_week_of date, p_picks jsonb)
returns setof uuid
language plpgsql
as $$
declare
  item jsonb;
  new_id uuid;
  wanted text;
begin
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
      concept_title, brief, brief_version, basis, priority_reason,
      service_id, timing, angle, expires_on
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
      nullif(item->'pick'->>'priority_reason', ''),
      nullif(item->'pick'->>'service_id', '')::uuid,
      nullif(item->'pick'->>'timing', ''),
      nullif(item->'pick'->>'angle', ''),
      nullif(item->'pick'->>'expires_on', '')::date
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

-- replace_week_picks keeps evergreen concepts and anything acted on; it
-- replaces only the week's unacted timely (or untagged) picks.
create or replace function public.replace_week_picks(p_business_id uuid, p_week_of date, p_picks jsonb)
returns setof uuid
language plpgsql
as $$
begin
  delete from public.picks p
  where p.business_id = p_business_id
    and p.week_of = p_week_of
    and coalesce(p.timing, 'timely') <> 'evergreen'
    and not exists (select 1 from public.pick_runs r where r.pick_id = p.id)
    and not exists (select 1 from public.pick_feedback f where f.pick_id = p.id);
  return query select * from public.insert_week_picks(p_business_id, p_week_of, p_picks);
end;
$$;
