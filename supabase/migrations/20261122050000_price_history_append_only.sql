-- Price history is append-only.
-- Applied after 20261122004500 and 20261122044500. Those files fill
-- crm_vendor_price_receipts.portal_draft_id once, from null to the receipt
-- JSON value, and protect_vendor_price_receipt allows that same fill.
--
-- crm_vendor_price_receipts allows one UPDATE: portal_draft_id changes from
-- null to a non-null value, and every other column is unchanged. The check is
-- to_jsonb(new) - 'portal_draft_id' = to_jsonb(old) - 'portal_draft_id'.
-- There is no role check. Every other UPDATE, and every DELETE or TRUNCATE,
-- raises for every role, including service_role and a postgres-owned function.
-- crm_live_lookup_line_price_revisions has no exception.
-- ENABLE ALWAYS keeps the triggers on when session_replication_role is replica.
-- crm_supplier_workflow_line_prices is not locked here.

create or replace function public.protect_vendor_price_receipt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $live$
begin
  if tg_op = 'UPDATE'
     and old.portal_draft_id is null
     and new.portal_draft_id is not null
     and (to_jsonb(new) - 'portal_draft_id') = (to_jsonb(old) - 'portal_draft_id')
  then
    return new;
  end if;
  raise exception 'Vendor price receipts are append-only.' using errcode = 'PT409';
end;
$live$;

create or replace function public.reject_price_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $lock$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'crm_vendor_price_receipts' then
    if old.portal_draft_id is null
       and new.portal_draft_id is not null
       and (to_jsonb(new) - 'portal_draft_id') = (to_jsonb(old) - 'portal_draft_id')
    then
      return new;
    end if;
  end if;
  raise exception 'Price history is append-only.'
    using errcode = 'PT409';
end;
$lock$;

comment on function public.reject_price_history_mutation() is
  'Receipts may gain portal_draft_id once, from null to a non-null value, with every other column unchanged. Every other price-history change raises. No role is exempt.';

revoke all on function public.reject_price_history_mutation() from public, anon, authenticated, service_role;
grant execute on function public.reject_price_history_mutation() to public;

drop trigger if exists crm_vendor_price_receipts_append_only_row on public.crm_vendor_price_receipts;
create trigger crm_vendor_price_receipts_append_only_row
  before update or delete on public.crm_vendor_price_receipts
  for each row
  execute function public.reject_price_history_mutation();

drop trigger if exists crm_vendor_price_receipts_append_only_truncate on public.crm_vendor_price_receipts;
create trigger crm_vendor_price_receipts_append_only_truncate
  before truncate on public.crm_vendor_price_receipts
  for each statement
  execute function public.reject_price_history_mutation();

drop trigger if exists crm_live_lookup_line_price_revisions_append_only_row on public.crm_live_lookup_line_price_revisions;
create trigger crm_live_lookup_line_price_revisions_append_only_row
  before update or delete on public.crm_live_lookup_line_price_revisions
  for each row
  execute function public.reject_price_history_mutation();

drop trigger if exists crm_live_lookup_line_price_revisions_append_only_truncate on public.crm_live_lookup_line_price_revisions;
create trigger crm_live_lookup_line_price_revisions_append_only_truncate
  before truncate on public.crm_live_lookup_line_price_revisions
  for each statement
  execute function public.reject_price_history_mutation();

alter table public.crm_vendor_price_receipts
  enable always trigger crm_vendor_price_receipts_append_only_row;
alter table public.crm_vendor_price_receipts
  enable always trigger crm_vendor_price_receipts_append_only_truncate;
alter table public.crm_live_lookup_line_price_revisions
  enable always trigger crm_live_lookup_line_price_revisions_append_only_row;
alter table public.crm_live_lookup_line_price_revisions
  enable always trigger crm_live_lookup_line_price_revisions_append_only_truncate;
