-- Mirror of prod migration quote_v2_soft_archive_priced_line_delete.
-- Draft line.delete / lines.clear soft-archive when price snapshots exist.
-- Hard-delete only when no snapshots. Snapshots stay append-only.
-- Re-running this file is a no-op once mutate_quote_v2_structure already
-- soft-archives, so a later deploy cannot rewrite that function.
-- The existing draft / sent / signed guard inside mutate stays untouched.
-- Active reads, counts, and totals ignore archived lines.

alter table public.sales_quote_line_items
  add column if not exists archived_at timestamptz;

comment on column public.sales_quote_line_items.archived_at is
  'Set when a draft line with immutable Quote V2 price history is removed from the live quote. Null means the line is active.';

create index if not exists sales_quote_line_items_quote_active_idx
  on public.sales_quote_line_items (quote_id)
  where archived_at is null;

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
  def text;
  previous text;
  filtered text;
  changed boolean := false;
  old_line text := $old_line$
      if exists (
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
$old_line$;
  new_line text := $new_line$
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.line_item_id = v_line_id
           and snapshots.quote_id = p_quote_id
      ) then
        update public.sales_quote_line_items
           set archived_at = coalesce(archived_at, now())
         where id = v_line_id
           and quote_id = p_quote_id
           and archived_at is null;
      else
        delete from public.sales_quote_line_items
         where id = v_line_id and quote_id = p_quote_id;
      end if;
$new_line$;
  old_clear text := $old_clear$
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A Quote V2 with immutable price history cannot be cleared until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      delete from public.sales_quote_line_items where quote_id = p_quote_id;
$old_clear$;
  new_clear text := $new_clear$
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.quote_id = p_quote_id
      ) then
        update public.sales_quote_line_items
           set archived_at = coalesce(archived_at, now())
         where quote_id = p_quote_id
           and archived_at is null;
      else
        delete from public.sales_quote_line_items where quote_id = p_quote_id;
      end if;
$new_clear$;
  targets regprocedure[] := array[
    'public.enforce_v2_quote_line_limit()'::regprocedure,
    'public.save_quote_v2_catalog_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure,
    'public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure,
    'public.save_quote_v2_pricing_result(uuid,uuid,uuid,bigint,text,uuid,boolean,jsonb,text,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure,
    'public.prepare_quote_v2_customer_send(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure,
    'public.set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean)'::regprocedure,
    'public.apply_quote_v2_custom_override(uuid,uuid,uuid,bigint,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.quote_v2_legacy_state_hash(uuid)'::regprocedure,
    'public.record_quote_v2_legacy_reprice_preview(uuid,bigint,text,uuid,date,jsonb,numeric,numeric,jsonb,jsonb)'::regprocedure
  ];
  target regprocedure;
begin
  def := pg_get_functiondef('public.mutate_quote_v2_structure(uuid,bigint,text,uuid,jsonb)'::regprocedure);
  if def is null then
    raise exception 'mutate_quote_v2_structure not found';
  end if;

  if position(old_line in def) > 0 then
    def := replace(def, old_line, new_line);
    changed := true;
  elsif position('A historically priced Quote V2 line cannot be deleted until the archive/read-filter contract is installed.' in def) > 0
     or position('set archived_at = coalesce(archived_at, now())' in def) = 0 then
    raise exception 'line.delete snapshot block not found — function may already be patched';
  end if;

  if position(old_clear in def) > 0 then
    def := replace(def, old_clear, new_clear);
    changed := true;
  elsif position('A Quote V2 with immutable price history cannot be cleared until the archive/read-filter contract is installed.' in def) > 0
     or position('set archived_at = coalesce(archived_at, now())' in def) = 0 then
    raise exception 'lines.clear snapshot block not found — function may already be patched';
  end if;

  filtered := public.quote_v2_sql_with_active_line_filter(def);
  if filtered is distinct from def then
    if position('lines.archived_at is null' in filtered) = 0 then
      raise exception 'Quote V2 structure read filter did not install.';
    end if;
    def := filtered;
    changed := true;
  end if;

  if changed then
    if position('set archived_at = coalesce(archived_at, now())' in def) = 0
      or position('A historically priced Quote V2 line cannot be deleted until the archive/read-filter contract is installed.' in def) > 0
      or position('A Quote V2 with immutable price history cannot be cleared until the archive/read-filter contract is installed.' in def) > 0 then
      raise exception 'refusing to replace mutate_quote_v2_structure without the soft-archive contract';
    end if;
    execute def;
  end if;

  foreach target in array targets loop
    def := pg_get_functiondef(target);
    if target = 'public.enforce_v2_quote_line_limit()'::regprocedure then
      if position('where quote_id = new.quote_id and archived_at is null' in def) = 0 then
        previous := def;
        def := replace(
          def,
          'where quote_id = new.quote_id',
          'where quote_id = new.quote_id and archived_at is null'
        );
        if def = previous then
          raise exception 'Quote V2 line limit archive filter did not install.';
        end if;
        execute def;
      end if;
      continue;
    end if;
    filtered := public.quote_v2_sql_with_active_line_filter(def);
    if filtered = def then
      if position('sales_quote_line_items' in def) > 0
        and position('archived_at is null' in def) = 0 then
        raise exception 'Quote V2 active-line read filter did not match %', target::text;
      end if;
    else
      execute filtered;
    end if;
  end loop;
end
$migration$;

drop function public.quote_v2_sql_with_active_line_filter(text);
