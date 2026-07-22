-- Additive production persistence for authoritative Quote V2.
--
-- This migration deliberately leaves every legacy quote unchanged. A quote is
-- V2 only when trusted server code sets quote_v2_backend = true together with
-- a non-legacy lifecycle state. Authenticated browser clients retain their
-- legacy permissions, but triggers reject direct mutations for V2 rows.

alter table public.sales_quotes
  add column if not exists quote_v2_backend boolean not null default false,
  add column if not exists quote_v2_status text not null default 'legacy',
  add column if not exists quote_v2_catalog_version text,
  add column if not exists quote_v2_revision bigint not null default 0,
  add column if not exists quote_v2_last_priced_at timestamptz;

alter table public.sales_quotes
  drop constraint if exists sales_quotes_quote_v2_status_check;

alter table public.sales_quotes
  add constraint sales_quotes_quote_v2_status_check check (
    (quote_v2_backend = false and quote_v2_status = 'legacy')
    or
    (quote_v2_backend = true and quote_v2_status in (
      'draft', 'stale', 'priced', 'blocked', 'sent'
    ))
  ),
  add constraint sales_quotes_quote_v2_revision_check
    check (quote_v2_revision >= 0);

alter table public.sales_quote_line_items
  add column if not exists selected_design_id uuid;

alter table public.sales_quote_designs
  add column if not exists quote_v2_selection jsonb not null default '{}'::jsonb,
  add column if not exists quote_v2_price_status text not null default 'legacy',
  add column if not exists quote_v2_selection_fingerprint text,
  add column if not exists quote_v2_priced_catalog_version text,
  add column if not exists quote_v2_priced_at timestamptz,
  add column if not exists current_v2_snapshot_id uuid;

alter table public.sales_quote_designs
  drop constraint if exists sales_quote_designs_quote_v2_price_status_check;

alter table public.sales_quote_designs
  add constraint sales_quote_designs_quote_v2_price_status_check check (
    quote_v2_price_status in (
      'legacy', 'stale', 'authoritative', 'blocked', 'unpriceable'
    )
  );

create unique index if not exists sales_quote_designs_id_line_item_uniq
  on public.sales_quote_designs (id, line_item_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_quote_line_items_selected_design_same_line_fk'
  ) then
    alter table public.sales_quote_line_items
      add constraint sales_quote_line_items_selected_design_same_line_fk
      foreign key (selected_design_id, id)
      references public.sales_quote_designs (id, line_item_id)
      deferrable initially deferred;
  end if;
end
$$;

create table if not exists public.sales_quote_v2_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  line_item_id uuid not null references public.sales_quote_line_items(id) on delete restrict,
  design_id uuid not null references public.sales_quote_designs(id) on delete restrict,
  quote_revision bigint not null,
  selection_fingerprint text not null,
  catalog_version text not null,
  retail_total numeric(12, 2) not null,
  internal_landed_cost_total numeric(12, 2) not null,
  retail_snapshot jsonb not null,
  internal_cost_snapshot jsonb not null,
  validation_snapshot jsonb not null,
  provenance_snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_price_snapshots_revision_check
    check (quote_revision >= 0),
  constraint sales_quote_v2_price_snapshots_retail_total_check
    check (retail_total >= 0),
  constraint sales_quote_v2_price_snapshots_landed_cost_check
    check (internal_landed_cost_total >= 0),
  constraint sales_quote_v2_price_snapshots_identity_uniq
    unique (design_id, quote_revision, selection_fingerprint, catalog_version)
);

create unique index if not exists sales_quote_v2_snapshots_id_design_uniq
  on public.sales_quote_v2_price_snapshots (id, design_id);

create index if not exists sales_quote_v2_snapshots_quote_created_idx
  on public.sales_quote_v2_price_snapshots (quote_id, created_at desc);

create index if not exists sales_quote_v2_snapshots_design_created_idx
  on public.sales_quote_v2_price_snapshots (design_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_quote_designs_current_v2_snapshot_same_design_fk'
  ) then
    alter table public.sales_quote_designs
      add constraint sales_quote_designs_current_v2_snapshot_same_design_fk
      foreign key (current_v2_snapshot_id, id)
      references public.sales_quote_v2_price_snapshots (id, design_id)
      deferrable initially deferred;
  end if;
end
$$;

create table if not exists public.sales_quote_v2_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  event_type text not null,
  previous_revision bigint,
  new_revision bigint not null,
  actor_id uuid,
  idempotency_key text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_events_previous_revision_check
    check (previous_revision is null or previous_revision >= 0),
  constraint sales_quote_v2_events_new_revision_check
    check (new_revision >= 0),
  constraint sales_quote_v2_events_revision_order_check
    check (previous_revision is null or new_revision > previous_revision)
);

create unique index if not exists sales_quote_v2_events_idempotency_uniq
  on public.sales_quote_v2_events (quote_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists sales_quote_v2_events_quote_revision_idx
  on public.sales_quote_v2_events (quote_id, new_revision, created_at);

create unique index if not exists sales_quote_v2_events_quote_revision_uniq
  on public.sales_quote_v2_events (quote_id, new_revision);

alter table public.sales_quote_v2_price_snapshots enable row level security;
alter table public.sales_quote_v2_events enable row level security;

revoke all on public.sales_quote_v2_price_snapshots from anon, authenticated;
revoke all on public.sales_quote_v2_events from anon, authenticated;

grant select on public.sales_quote_v2_price_snapshots to authenticated;
grant select on public.sales_quote_v2_events to authenticated;
grant all on public.sales_quote_v2_price_snapshots to service_role;
grant all on public.sales_quote_v2_events to service_role;

drop policy if exists "805 CRM users read V2 price snapshots"
  on public.sales_quote_v2_price_snapshots;
create policy "805 CRM users read V2 price snapshots"
on public.sales_quote_v2_price_snapshots
for select
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

drop policy if exists "805 CRM users read V2 quote events"
  on public.sales_quote_v2_events;
create policy "805 CRM users read V2 quote events"
on public.sales_quote_v2_events
for select
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

create or replace function public.enforce_v2_quote_line_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_v2 boolean;
  existing_count integer;
begin
  -- Lock the parent row so concurrent inserts cannot both become line 40/41.
  select quote_v2_backend
    into is_v2
    from public.sales_quotes
   where id = new.quote_id
   for update;

  if coalesce(is_v2, false) then
    select count(*)
      into existing_count
      from public.sales_quote_line_items
     where quote_id = new.quote_id
       and id <> new.id;

    if existing_count >= 40 then
      raise exception 'A V2 quote can contain no more than 40 line items.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_v2_quote_line_limit() from public;

drop trigger if exists sales_quote_v2_line_limit_trigger
  on public.sales_quote_line_items;
create trigger sales_quote_v2_line_limit_trigger
before insert or update of quote_id
on public.sales_quote_line_items
for each row
execute function public.enforce_v2_quote_line_limit();

create or replace function public.block_authenticated_v2_quote_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  requested_v2 boolean;
begin
  if auth.role() <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  requested_v2 := case
    when tg_op = 'DELETE' then old.quote_v2_backend
    else new.quote_v2_backend
  end;

  if requested_v2
    or (tg_op = 'UPDATE' and old.quote_v2_backend)
  then
    raise exception 'Authoritative V2 quotes can only be mutated by the server.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.block_authenticated_v2_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_quote_id uuid;
  target_line_item_id uuid;
  is_v2 boolean;
begin
  if auth.role() <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'sales_quote_line_items' then
    target_quote_id := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  elsif tg_table_name = 'sales_quote_designs' then
    target_line_item_id := case when tg_op = 'DELETE' then old.line_item_id else new.line_item_id end;
    select quote_id
      into target_quote_id
      from public.sales_quote_line_items
     where id = target_line_item_id;
  else
    raise exception 'Unexpected V2 child table %.', tg_table_name;
  end if;

  select quote_v2_backend
    into is_v2
    from public.sales_quotes
   where id = target_quote_id;

  if coalesce(is_v2, false) then
    raise exception 'Authoritative V2 quote children can only be mutated by the server.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.reject_v2_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Quote V2 snapshots and events are append-only.'
    using errcode = '55000';
end;
$$;

revoke all on function public.block_authenticated_v2_quote_mutation() from public;
revoke all on function public.block_authenticated_v2_child_mutation() from public;
revoke all on function public.reject_v2_audit_mutation() from public;

drop trigger if exists sales_quotes_block_authenticated_v2_mutation
  on public.sales_quotes;
create trigger sales_quotes_block_authenticated_v2_mutation
before insert or update or delete
on public.sales_quotes
for each row
execute function public.block_authenticated_v2_quote_mutation();

drop trigger if exists sales_quote_line_items_block_authenticated_v2_mutation
  on public.sales_quote_line_items;
create trigger sales_quote_line_items_block_authenticated_v2_mutation
before insert or update or delete
on public.sales_quote_line_items
for each row
execute function public.block_authenticated_v2_child_mutation();

drop trigger if exists sales_quote_designs_block_authenticated_v2_mutation
  on public.sales_quote_designs;
create trigger sales_quote_designs_block_authenticated_v2_mutation
before insert or update or delete
on public.sales_quote_designs
for each row
execute function public.block_authenticated_v2_child_mutation();

drop trigger if exists sales_quote_v2_snapshots_append_only
  on public.sales_quote_v2_price_snapshots;
create trigger sales_quote_v2_snapshots_append_only
before update or delete
on public.sales_quote_v2_price_snapshots
for each row
execute function public.reject_v2_audit_mutation();

drop trigger if exists sales_quote_v2_events_append_only
  on public.sales_quote_v2_events;
create trigger sales_quote_v2_events_append_only
before update or delete
on public.sales_quote_v2_events
for each row
execute function public.reject_v2_audit_mutation();

comment on table public.sales_quote_v2_price_snapshots is
  'Append-only authoritative Quote V2 retail, protected cost, validation, and provenance snapshots.';

comment on table public.sales_quote_v2_events is
  'Append-only Quote V2 mutation and lifecycle audit events.';
