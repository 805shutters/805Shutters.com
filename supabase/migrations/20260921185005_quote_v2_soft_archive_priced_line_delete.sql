-- Systemic: allow draft Quote V2 line deletes when price snapshots exist by soft-archiving.
-- Snapshots stay append-only; hard-delete only when no snapshots.

alter table public.sales_quote_line_items
  add column if not exists archived_at timestamptz;

create index if not exists sales_quote_line_items_quote_active_idx
  on public.sales_quote_line_items (quote_id)
  where archived_at is null;

do $migrate$
declare
  def text;
  new_def text;
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
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'mutate_quote_v2_structure';

  if def is null then
    raise exception 'mutate_quote_v2_structure not found';
  end if;

  if position(old_line in def) = 0 then
    raise exception 'line.delete snapshot block not found — function may already be patched';
  end if;
  if position(old_clear in def) = 0 then
    raise exception 'lines.clear snapshot block not found — function may already be patched';
  end if;

  new_def := replace(replace(def, old_line, new_line), old_clear, new_clear);
  execute new_def;
end
$migrate$;
