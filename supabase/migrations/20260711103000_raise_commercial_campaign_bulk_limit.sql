alter table public.crm_commercial_campaigns
drop constraint if exists crm_commercial_campaigns_daily_limit_check;

alter table public.crm_commercial_campaigns
add constraint crm_commercial_campaigns_daily_limit_check
check (daily_limit between 1 and 5000);
