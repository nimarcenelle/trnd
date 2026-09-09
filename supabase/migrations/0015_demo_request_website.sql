-- Demo requests capture the website so the pre-call sample can be built
-- from what the business actually sells (the same read onboarding does).
alter table public.demo_requests add column if not exists website text;
