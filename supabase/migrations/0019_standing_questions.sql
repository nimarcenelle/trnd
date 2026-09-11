-- Standing questions: what the owner wants answered every week. Re-answered
-- each Monday by the weekly cron against that week's facts and memory, with
-- one line on what moved since the previous answer. The evergreen loop —
-- a question that never closes, answered before it's asked.
create table public.standing_questions (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  question         text not null,
  active           boolean not null default true,
  answer           text[] not null default '{}',
  changed          text,
  answered_week    date,
  previous_answer  text[] not null default '{}',
  model_used       text,
  created_at       timestamptz not null default now()
);
alter table public.standing_questions enable row level security;
create index standing_questions_business_idx on public.standing_questions (business_id, created_at);

create policy "standing_questions: via business" on public.standing_questions
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
