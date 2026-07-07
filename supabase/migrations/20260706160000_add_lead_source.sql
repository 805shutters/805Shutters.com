-- Marketing-channel attribution ("where did this customer come from"):
-- Yelp, Nextdoor, Google Search, AI Chat, Facebook, referral, etc.
-- Distinct from the existing `source` columns, which record the entry
-- mechanism (manual / crm / self_booking / website).
alter table public.crm_jobs
  add column if not exists lead_source text;

alter table public.leads
  add column if not exists lead_source text;
