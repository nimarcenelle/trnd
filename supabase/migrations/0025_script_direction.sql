-- Scripts carry direction (what to show, what to argue, what to prove), not
-- a shot list with lines to read. The hook stays the one verbatim line.
-- Run after 0024. Idempotent: pasted by hand, safe to re-run.

alter table public.pick_scripts
  add column if not exists direction jsonb;

-- replace_week_picks writes the direction alongside the (now optional) beats.
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

    insert into public.pick_scripts (pick_id, position, variant_label, thesis, hook, beats, direction, cta, duration_seconds)
    select new_id, (s.ordinality - 1)::integer, s.value->>'variant_label', s.value->>'thesis', s.value->>'hook',
           coalesce(s.value->'beats', '[]'::jsonb), s.value->'direction', s.value->>'cta', (s.value->>'duration_seconds')::integer
    from jsonb_array_elements(coalesce(item->'scripts', '[]'::jsonb)) with ordinality as s(value, ordinality);

    return next new_id;
  end loop;
end;
$$;
