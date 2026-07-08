-- =============================================================
-- 805 quote-builder REPAIR — functions + triggers + RLS policies.
-- Excludes table creation (tables already exist) and the
-- public.crm_users view (the statement that was erroring and
-- rolling back the whole migration). Every statement here is
-- create-or-replace / drop-if-exists, so it is safe to re-run.
-- Paste into the 805 Supabase SQL editor and Run.
-- =============================================================

-- caller authorization helper (used by next_quote_number + policies)
create or replace function public.is_805_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.crm_profiles profile
    where profile.id = auth.uid()
      and profile.active = true
      and lower(profile.email) in (
        '805shutters@gmail.com',
        'jessica@805shutters.com',
        'khill31@msn.com'
      )
  );
$$;

revoke all on function public.is_805_crm_user() from anon;
grant execute on function public.is_805_crm_user() to authenticated, service_role;

-- trigger fns, sales_quote_auto_installed, next_quote_number,
-- is_805_sales_quote helpers, triggers, RLS enable, grants, policies
create or replace function public.update_sales_quote_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_sales_quote_media_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_sales_805_appointments_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_quote_order_agent_queue_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sales_quote_auto_installed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  total_paid numeric;
begin
  if new.status is distinct from 'received' then
    return new;
  end if;

  if new.total_amount is null or new.total_amount <= 0 then
    return new;
  end if;

  if new.account_id <> '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid then
    return new;
  end if;

  total_paid := coalesce(new.deposit_paid, 0) + coalesce(new.balance_paid, 0);
  if total_paid >= new.total_amount - 0.01 then
    new.status := 'installed';
    new.installed_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.next_quote_number(account_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_num int;
begin
  if account_prefix <> '805' then
    raise exception 'Only the 805 quote prefix is available in this CRM.';
  end if;

  if not public.is_805_crm_user() then
    raise exception '805 CRM authentication is required.';
  end if;

  select coalesce(max(nullif(regexp_replace(split_part(quote_number, '-', 2), '[^0-9]', '', 'g'), '')::int), 0) + 1
    into next_num
  from public.sales_quotes
  where account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
    and quote_number like account_prefix || '-%';

  return account_prefix || '-' || lpad(next_num::text, 4, '0');
end;
$$;

revoke all on function public.next_quote_number(text) from anon;
grant execute on function public.next_quote_number(text) to authenticated, service_role;

drop trigger if exists sales_quotes_updated_at on public.sales_quotes;
create trigger sales_quotes_updated_at
before update on public.sales_quotes
for each row
execute function public.update_sales_quote_updated_at();

drop trigger if exists sales_quote_auto_installed_trigger on public.sales_quotes;
create trigger sales_quote_auto_installed_trigger
before update on public.sales_quotes
for each row
execute function public.sales_quote_auto_installed();

drop trigger if exists trg_sales_quote_media_updated_at on public.sales_quote_media;
create trigger trg_sales_quote_media_updated_at
before update on public.sales_quote_media
for each row
execute function public.set_sales_quote_media_updated_at();

drop trigger if exists trg_sales_805_appointments_updated_at on public.sales_805_appointments;
create trigger trg_sales_805_appointments_updated_at
before update on public.sales_805_appointments
for each row
execute function public.set_sales_805_appointments_updated_at();

drop trigger if exists trg_quote_order_agent_queue_updated_at on public.quote_order_agent_queue;
create trigger trg_quote_order_agent_queue_updated_at
before update on public.quote_order_agent_queue
for each row
execute function public.set_quote_order_agent_queue_updated_at();

create or replace function public.is_805_sales_quote(quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sales_quotes quote
    where quote.id = quote_id
      and quote.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
  );
$$;

create or replace function public.is_805_sales_quote_line_item(line_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sales_quote_line_items item
    join public.sales_quotes quote on quote.id = item.quote_id
    where item.id = line_item_id
      and quote.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
  );
$$;

revoke all on function public.is_805_sales_quote(uuid) from anon;
revoke all on function public.is_805_sales_quote_line_item(uuid) from anon;
grant execute on function public.is_805_sales_quote(uuid) to authenticated, service_role;
grant execute on function public.is_805_sales_quote_line_item(uuid) to authenticated, service_role;

alter table public.sales_quotes enable row level security;
alter table public.sales_quote_line_items enable row level security;
alter table public.sales_quote_designs enable row level security;
alter table public.sales_quote_media enable row level security;
alter table public.sales_805_appointments enable row level security;
alter table public.quote_order_agent_queue enable row level security;

revoke all on public.sales_quotes from anon;
revoke all on public.sales_quote_line_items from anon;
revoke all on public.sales_quote_designs from anon;
revoke all on public.sales_quote_media from anon;
revoke all on public.sales_805_appointments from anon;
revoke all on public.quote_order_agent_queue from anon;

grant select, insert, update, delete on public.sales_quotes to authenticated;
grant select, insert, update, delete on public.sales_quote_line_items to authenticated;
grant select, insert, update, delete on public.sales_quote_designs to authenticated;
grant select, insert, update, delete on public.sales_quote_media to authenticated;
grant select, insert, update, delete on public.sales_805_appointments to authenticated;
grant select, insert, update, delete on public.quote_order_agent_queue to authenticated;

drop policy if exists "805 CRM users manage sales quotes" on public.sales_quotes;
create policy "805 CRM users manage sales quotes"
on public.sales_quotes
for all
to authenticated
using (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
)
with check (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
);

drop policy if exists "805 CRM users manage sales quote line items" on public.sales_quote_line_items;
create policy "805 CRM users manage sales quote line items"
on public.sales_quote_line_items
for all
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
)
with check (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

drop policy if exists "805 CRM users manage sales quote designs" on public.sales_quote_designs;
create policy "805 CRM users manage sales quote designs"
on public.sales_quote_designs
for all
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote_line_item(line_item_id)
)
with check (
  public.is_805_crm_user()
  and public.is_805_sales_quote_line_item(line_item_id)
);

drop policy if exists "805 CRM users manage sales quote media" on public.sales_quote_media;
create policy "805 CRM users manage sales quote media"
on public.sales_quote_media
for all
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
  and (line_item_id is null or public.is_805_sales_quote_line_item(line_item_id))
)
with check (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
  and (line_item_id is null or public.is_805_sales_quote_line_item(line_item_id))
);

drop policy if exists "805 CRM users manage 805 sales appointments" on public.sales_805_appointments;
create policy "805 CRM users manage 805 sales appointments"
on public.sales_805_appointments
for all
to authenticated
using (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
)
with check (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
);

drop policy if exists "805 CRM users manage quote order agent queue" on public.quote_order_agent_queue;
create policy "805 CRM users manage quote order agent queue"
on public.quote_order_agent_queue
for all
to authenticated
using (
  public.is_805_crm_user()
  and (account_id is null or account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid)
  and public.is_805_sales_quote(quote_id)
)
with check (
  public.is_805_crm_user()
  and (account_id is null or account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid)
  and public.is_805_sales_quote(quote_id)
);

-- refresh the PostgREST API/schema cache so the RPC resolves
notify pgrst, 'reload schema';
