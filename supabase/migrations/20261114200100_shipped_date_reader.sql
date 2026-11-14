-- Shipped-date reader. Additive. Does not change quote status.
--
-- crm_shipping_notices stores one row per manufacturer + order number. The same
-- notice is delivered to both 805 mailboxes, so the key is the order number,
-- not the Gmail message id. wcbot is not a source.
--
-- crm_shipping_review is the staff review list (open rows) plus proposals logged
-- while SHIPPED_DATE_WRITES_ENABLED is off (status logged).
--
-- Trigger check for a received_at + manufacturer_order_ref update on crm_quotes:
--   freeze_native_crm_quote / protect_native_quote_delivery
--     does not list received_at or manufacturer_order_ref. A native-frozen quote
--     such as 805-0470 can take this update. Financial and signature columns stay frozen.
--   crm_quotes_set_updated_at
--     sets updated_at only. The application does not write that column.
--   crm_quotes_enqueue_installer_delivery
--     fires on status, signed_at, sold_at, archived_at, meta, external_source.
--     This update does not enqueue installer mail.
--   crm_quotes_ken_identity
--     fires on job_id, quote_total, meta, sold_at, signed_at, status, archived_at.
--     This update does not rebuild Ken payoff identity.
--   in_house_total_changed / hold_in_house_plan_evidence
--     returns immediately unless quote_total or meta.adjustments changed.
--   crm_quotes_google_contact
--     fires on every update and, for status = sold, re-queues a Google contact.
--     apply_crm_quote_shipped_date sets crm.shipped_date_write for that transaction
--     so a ship-date write does not re-queue the contact.

create table public.crm_shipping_notices (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null check (manufacturer in ('Norman', 'Onyx', 'Lotus')),
  order_ref text not null,
  po_number text,
  ship_date date,
  ship_date_source text not null check (ship_date_source in (
    'notice',
    'email_received_america_los_angeles',
    'email_received_america_los_angeles_minus_one_day'
  )),
  mailbox_email text,
  gmail_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_shipping_notices_order_unique unique (manufacturer, order_ref)
);

create index crm_shipping_notices_order_ref_idx on public.crm_shipping_notices (order_ref);

create table public.crm_shipping_review (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  manufacturer text,
  order_ref text,
  po_number text,
  mailbox_email text,
  gmail_message_id text,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  quote_number text,
  reason text not null check (reason in (
    'no_match',
    'multiple',
    'bookkeeping_only',
    'lotus_not_shipped',
    'partial',
    'no_ship_date',
    'proposed_write'
  )),
  detail text,
  proposed_received_at date,
  proposed_manufacturer_order_ref text,
  status text not null default 'open' check (status in ('open', 'logged', 'resolved', 'applied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_shipping_review_dedupe_unique unique (dedupe_key)
);

create index crm_shipping_review_open_idx on public.crm_shipping_review (status, updated_at desc);

alter table public.crm_shipping_notices enable row level security;
alter table public.crm_shipping_review enable row level security;
revoke all on public.crm_shipping_notices, public.crm_shipping_review from public, anon, authenticated;
grant all on public.crm_shipping_notices, public.crm_shipping_review to service_role;
create policy "service role can manage shipping notices"
  on public.crm_shipping_notices for all to service_role using (true) with check (true);
create policy "service role can manage shipping review"
  on public.crm_shipping_review for all to service_role using (true) with check (true);

-- Writes received_at and manufacturer_order_ref only. Status and every other
-- quote column are left to existing triggers (updated_at).
create function public.apply_crm_quote_shipped_date(
  p_quote_id uuid,
  p_received_at timestamptz,
  p_manufacturer_order_ref text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform set_config('crm.shipped_date_write', 'on', true);
  update public.crm_quotes
    set received_at = p_received_at,
        manufacturer_order_ref = p_manufacturer_order_ref
    where id = p_quote_id
    returning id into v_id;
  if v_id is null then
    raise exception 'Quote not found for shipped-date write';
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.apply_crm_quote_shipped_date(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_crm_quote_shipped_date(uuid, timestamptz, text) to service_role;

create or replace function public.crm_queue_google_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare customer_name text; v_customer_key text;
begin
  if tg_table_schema <> 'public' or tg_table_name not in ('crm_quotes','crm_jobs','crm_customers','crm_customer_contracts') then
    raise exception 'Unsupported Contacts trigger source';
  end if;
  if tg_table_name = 'crm_quotes' then
    if current_setting('crm.shipped_date_write', true) = 'on' then return new; end if;
    if new.status <> 'sold' then return new; end if;
    select j.customer_name into customer_name from public.crm_jobs j where j.id = new.job_id;
    customer_name := coalesce(nullif(customer_name,''),new.customer_printed_name);
  elsif tg_table_name = 'crm_jobs' then
    customer_name := new.customer_name;
    if new.status <> 'sold' and not exists(select 1 from public.crm_google_contacts_sync s where s.source_refs @> array['job:' || new.id::text]) then return new; end if;
  elsif tg_table_name = 'crm_customers' then
    customer_name := new.display_name;
    if coalesce(new.latest_status,'') <> 'sold' and not exists(select 1 from public.crm_google_contacts_sync s where s.source_refs @> array['customer:' || new.id::text]) then return new; end if;
  else
    if new.status <> 'sold' then return new; end if;
    select c.display_name into customer_name from public.crm_customers c where c.id = new.customer_id;
  end if;
  v_customer_key := trim(regexp_replace(lower(trim(coalesce(customer_name,''))), '[^a-z0-9]+', ' ', 'g'));
  if v_customer_key = '' then return new; end if;
  insert into public.crm_google_contacts_sync(customer_key) values (v_customer_key)
  on conflict (customer_key) do update set status = 'pending', exception_code = null, requested_at = clock_timestamp(), next_attempt_at = now(), updated_at = now();
  return new;
end;
$$;
