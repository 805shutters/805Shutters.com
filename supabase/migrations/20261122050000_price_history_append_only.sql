-- Price history is append-only.
-- crm_vendor_price_receipts and crm_live_lookup_line_price_revisions reject
-- UPDATE, DELETE, and TRUNCATE for every role. The trigger function does not
-- read current_user, session_user, or any role. service_role and a function
-- owned by postgres hit the same exception. ENABLE ALWAYS keeps the triggers
-- on when session_replication_role is replica.
--
-- This does not add a portal_draft_id exception. The older
-- protect_vendor_price_receipt() still allows one fill of a null
-- portal_draft_id. These triggers fire as well and raise on that fill.
-- public.backfill_current_live_price_fields() therefore fails when it would
-- update a receipt. That call is left unchanged for Mike. New receipts already
-- copy portal_draft_id on insert inside record_vendor_price_receipt.
-- crm_supplier_workflow_line_prices is not locked here.

create or replace function public.reject_price_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $lock$
begin
  raise exception 'Price history is append-only.'
    using errcode = 'PT409';
end;
$lock$;

comment on function public.reject_price_history_mutation() is
  'Rejects UPDATE, DELETE, and TRUNCATE on price history. No role and no column is exempt.';

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
