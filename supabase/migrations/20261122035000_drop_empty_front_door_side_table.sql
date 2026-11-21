-- Remove the Quoter front-door side table after it is confirmed empty,
-- then add sales_quotes.front_door_readback for the draft read-back.
-- This migration does not delete rows. If any side-table row exists, it stops
-- and leaves the table, its policies, and its grants in place.
-- Installer notes are not used. Not applied to production by the pull request
-- that adds this file.

do $$
declare
  side_count bigint;
begin
  if to_regclass('public.crm_quote_front_door_drafts') is not null then
    select count(*) into side_count from public.crm_quote_front_door_drafts;
    if side_count <> 0 then
      raise exception 'crm_quote_front_door_drafts has % row(s); refusing to drop the table.', side_count;
    end if;

    drop policy if exists crm_quote_front_door_drafts_staff_read on public.crm_quote_front_door_drafts;
    drop policy if exists crm_quote_front_door_drafts_service_read on public.crm_quote_front_door_drafts;
    drop policy if exists crm_quote_front_door_drafts_service_insert on public.crm_quote_front_door_drafts;
    revoke all on table public.crm_quote_front_door_drafts from public, anon, authenticated, service_role;
    drop trigger if exists crm_quote_front_door_drafts_set_updated_at on public.crm_quote_front_door_drafts;
    drop table public.crm_quote_front_door_drafts;
  end if;

  alter table public.sales_quotes
    add column if not exists front_door_readback jsonb;
end $$;

comment on column public.sales_quotes.front_door_readback is
  'Read-back saved with a front-door draft. Installer notes stay staff-written.';
