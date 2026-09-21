-- Archive priced Quote V2 draft lines instead of hard-deleting them.
-- Price snapshots stay append-only. Sent and signed quotes stay locked.
-- Active reads, counts, and totals ignore sales_quote_line_items.archived_at.

alter table public.sales_quote_line_items
  add column if not exists archived_at timestamptz;

comment on column public.sales_quote_line_items.archived_at is
  'Set when a draft line with immutable Quote V2 price history is removed from the live quote. Null means the line is active.';

create index if not exists sales_quote_line_items_active_quote_idx
  on public.sales_quote_line_items (quote_id, sort_order)
  where archived_at is null;

-- QUOTE_V2_ARCHIVE_FUNCTIONS_BEGIN
create or replace function public.quote_v2_reject_locked_structure(p_quote_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
      from public.sales_quotes quotes
     where quotes.id = p_quote_id
       and (
         quotes.status is distinct from 'draft'
         or quotes.quote_v2_status = 'sent'
         or quotes.sent_at is not null
         or quotes.signed_at is not null
       )
  ) then
    raise exception 'Only an unlocked, unsent Quote V2 draft can be structurally changed.'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.quote_v2_delete_active_line(
  p_quote_id uuid,
  p_line_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_affected integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 line archive requires the service role.'
      using errcode = '42501';
  end if;
  perform public.quote_v2_reject_locked_structure(p_quote_id);
  if exists (
    select 1
      from public.sales_quote_v2_price_snapshots snapshots
     where snapshots.line_item_id = p_line_id
       and snapshots.quote_id = p_quote_id
  ) then
    update public.sales_quote_line_items
       set archived_at = now()
     where id = p_line_id
       and quote_id = p_quote_id
       and archived_at is null;
  else
    delete from public.sales_quote_line_items
     where id = p_line_id
       and quote_id = p_quote_id
       and archived_at is null;
  end if;
  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

create or replace function public.quote_v2_clear_active_lines(p_quote_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_archived integer;
  v_deleted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 line archive requires the service role.'
      using errcode = '42501';
  end if;
  perform public.quote_v2_reject_locked_structure(p_quote_id);
  update public.sales_quote_line_items lines
     set archived_at = now()
   where lines.quote_id = p_quote_id
     and lines.archived_at is null
     and exists (
       select 1
         from public.sales_quote_v2_price_snapshots snapshots
        where snapshots.line_item_id = lines.id
          and snapshots.quote_id = p_quote_id
     );
  get diagnostics v_archived = row_count;
  delete from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id
     and lines.archived_at is null;
  get diagnostics v_deleted = row_count;
  return v_archived + v_deleted;
end;
$$;

revoke all on function public.quote_v2_reject_locked_structure(uuid)
  from public, anon, authenticated;
revoke all on function public.quote_v2_delete_active_line(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.quote_v2_clear_active_lines(uuid)
  from public, anon, authenticated;
grant execute on function public.quote_v2_reject_locked_structure(uuid)
  to service_role;
grant execute on function public.quote_v2_delete_active_line(uuid, uuid)
  to service_role;
grant execute on function public.quote_v2_clear_active_lines(uuid)
  to service_role;
-- QUOTE_V2_ARCHIVE_FUNCTIONS_END

create or replace function public.quote_v2_sql_with_active_line_filter(p_definition text)
returns text
language plpgsql
immutable
as $$
declare
  v_definition text := p_definition;
  v_needles text[] := array[
    'lines.quote_id = p_quote_id',
    'lines.quote_id=p_quote_id',
    'lines.quote_id = quotes.id',
    'l.quote_id=q.id',
    'l.quote_id=p_quote_id',
    'li.quote_id=q.id',
    'li.quote_id = q.id'
  ];
  v_filters text[] := array[
    'lines.archived_at is null',
    'lines.archived_at is null',
    'lines.archived_at is null',
    'l.archived_at is null',
    'l.archived_at is null',
    'li.archived_at is null',
    'li.archived_at is null'
  ];
  v_index integer;
  v_replacement text;
begin
  for v_index in 1 .. array_length(v_needles, 1) loop
    v_replacement := v_needles[v_index] || ' and ' || v_filters[v_index];
    if position(v_replacement in v_definition) = 0 then
      v_definition := replace(v_definition, v_needles[v_index], v_replacement);
    end if;
  end loop;
  return v_definition;
end;
$$;

do $migration$
declare
  definition text;
  previous text;
  filtered text;
  targets regprocedure[] := array[
    'public.mutate_quote_v2_structure(uuid,bigint,text,uuid,jsonb)'::regprocedure,
    'public.enforce_v2_quote_line_limit()'::regprocedure,
    'public.save_quote_v2_catalog_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure,
    'public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure,
    'public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure,
    'public.prepare_quote_v2_customer_send(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure,
    'public.set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean)'::regprocedure,
    'public.apply_quote_v2_custom_override(uuid,uuid,uuid,bigint,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.quote_v2_legacy_state_hash(uuid)'::regprocedure
  ];
  target regprocedure;
begin
  definition := pg_get_functiondef('public.mutate_quote_v2_structure(uuid,bigint,text,uuid,jsonb)'::regprocedure);
  previous := definition;
  definition := replace(definition, $old$      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.line_item_id = v_line_id
           and snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A historically priced Quote V2 line cannot be deleted until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      delete from public.sales_quote_line_items
       where id = v_line_id and quote_id = p_quote_id;
      get diagnostics v_affected_count = row_count;$old$, $new$      v_affected_count := public.quote_v2_delete_active_line(p_quote_id, v_line_id);$new$);
  if definition = previous then
    raise exception 'Quote V2 line.delete archive target changed.';
  end if;
  previous := definition;
  definition := replace(definition, $old$      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A Quote V2 with immutable price history cannot be cleared until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      delete from public.sales_quote_line_items where quote_id = p_quote_id;
      get diagnostics v_affected_count = row_count;$old$, $new$      v_affected_count := public.quote_v2_clear_active_lines(p_quote_id);$new$);
  if definition = previous then
    raise exception 'Quote V2 lines.clear archive target changed.';
  end if;
  filtered := public.quote_v2_sql_with_active_line_filter(definition);
  if filtered = definition or position('lines.archived_at is null' in filtered) = 0 then
    raise exception 'Quote V2 structure read filter did not install.';
  end if;
  execute filtered;

  definition := pg_get_functiondef('public.enforce_v2_quote_line_limit()'::regprocedure);
  previous := definition;
  definition := replace(
    definition,
    'where quote_id = new.quote_id',
    'where quote_id = new.quote_id and archived_at is null'
  );
  if definition = previous then
    raise exception 'Quote V2 line limit archive filter did not install.';
  end if;
  execute definition;

  foreach target in array targets loop
    if target = 'public.mutate_quote_v2_structure(uuid,bigint,text,uuid,jsonb)'::regprocedure
      or target = 'public.enforce_v2_quote_line_limit()'::regprocedure then
      continue;
    end if;
    definition := pg_get_functiondef(target);
    filtered := public.quote_v2_sql_with_active_line_filter(definition);
    if filtered = definition then
      if position('sales_quote_line_items' in definition) > 0
        and position('archived_at is null' in definition) = 0 then
        raise exception 'Quote V2 active-line read filter did not match %', target::text;
      end if;
    else
      execute filtered;
    end if;
  end loop;
end
$migration$;

drop function public.quote_v2_sql_with_active_line_filter(text);
