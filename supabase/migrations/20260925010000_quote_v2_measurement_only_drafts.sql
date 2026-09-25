-- Measurement-only draft lines have an explicit empty product and no designs.
-- Keep the existing RPC authorization, revisions, pricing invalidation and audit history.
do $migration$
declare
  definition text;
  old_create text := $old$        or btrim(coalesce(v_patch ->> 'productType', '')) = ''$old$;
  new_create text := $new$        or jsonb_typeof(v_patch -> 'productType') is distinct from 'string'$new$;
  old_selected text := $old$       and lines.selected_design_id is null
  ) then
    raise exception 'Every Quote V2 line must have exactly one selected design.'$old$;
  new_selected text := $new$       and (
         (coalesce(btrim(lines.product_type), '') <> '' and lines.selected_design_id is null)
         or (coalesce(btrim(lines.product_type), '') = '' and exists (
           select 1 from public.sales_quote_designs d where d.line_item_id = lines.id
         ))
       )
  ) then
    raise exception 'Unassigned Quote V2 lines cannot have designs; every configured Quote V2 line must have exactly one selected design.'$new$;
begin
  select pg_get_functiondef('public.mutate_quote_v2_structure(uuid,bigint,text,uuid,jsonb)'::regprocedure)
    into definition;
  if position(old_create in definition) = 0 or position(old_selected in definition) = 0 then
    raise exception 'Measurement-only draft migration does not match the installed structure RPC.';
  end if;
  definition := replace(definition, old_create, new_create);
  definition := replace(definition, old_selected, new_selected);
  definition := replace(definition, 'Quote V2 line creation requires roomName and productType.',
    'Quote V2 line creation requires a room label and a productType string (empty for unassigned windows).');
  execute definition;
end
$migration$;
