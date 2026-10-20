-- Security review (October 2026). Safe to re-run; paste into the Supabase SQL editor.

-- The free preview's caps, taken in one transaction: concurrent starts can no
-- longer all read "under the cap" before any of them counts. Locks the day's
-- "all" row, then the visitor's, so two calls never wait on each other in a cycle.
create or replace function public.take_preview_slot(p_visitor text, p_day date, p_per_visitor int, p_budget int)
returns text
language plpgsql
set search_path = public
as $$
declare
  v int;
  a int;
begin
  insert into public.preview_hits (key, day, count) values ('all', p_day, 0), (p_visitor, p_day, 0) on conflict do nothing;
  select count into a from public.preview_hits where key = 'all' and day = p_day for update;
  select count into v from public.preview_hits where key = p_visitor and day = p_day for update;
  if a >= p_budget then return 'budget'; end if;
  if v >= p_per_visitor then return 'visitor'; end if;
  update public.preview_hits set count = count + 1 where day = p_day and key in ('all', p_visitor);
  return 'ok';
end;
$$;
-- Server only: a visitor calling it through the public API could spend everyone's daily budget.
revoke all on function public.take_preview_slot(text, date, int, int) from public, anon, authenticated;
grant execute on function public.take_preview_slot(text, date, int, int) to service_role;

-- Defense in depth: the tables only the server reads or writes carry no grants
-- for the browser's roles at all, so a policy added by mistake can't open them.
revoke all on public.tiktok_connections, public.previews, public.preview_hits from anon, authenticated;
-- Every write goes through the service role; signed-in users and visitors only read, under RLS.
revoke insert, update, delete, truncate, references, trigger on
  public.creators, public.peers, public.videos, public.video_snapshots, public.follower_snapshots,
  public.trend_snapshots, public.plans, public.idea_runs
  from anon, authenticated;
