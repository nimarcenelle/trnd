-- The week's #1 pick is now built without being asked — by the Monday cron
-- and by the dashboard after its response — so two writers can race for the
-- same opportunity. One campaign per pick was always the assumption
-- (getCampaignByOpportunity reads a single row); make the database hold it.
create unique index if not exists campaigns_opportunity_uniq
  on public.campaigns (opportunity_id);
