-- Repeated staff-price saves may inherit an explicitly unresolved manual cost.
-- Verify immutable ownership and provenance before using the unknown-cost path.
create or replace function public.quote_v2_manual_unknown_cost(p_snapshot_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select
    s.catalog_version='custom-override-v1'
    and s.provenance_snapshot->>'mode'='custom_override'
    and s.provenance_snapshot->>'internalOnly'='true'
    and s.provenance_snapshot->>'manualLinePrice'='true'
    and s.internal_cost_snapshot->>'status'='unresolved'
    and s.internal_cost_snapshot->>'landedCostTotal' is null
    and (s.provenance_snapshot->>'costResolution'='unresolved'
      or (s.provenance_snapshot->>'costResolution'='preserved_snapshot' and exists (
        select 1 from public.sales_quote_v2_price_snapshots root
        where root.id::text=s.provenance_snapshot->>'originalSnapshotId'
          and root.quote_id=s.quote_id and root.line_item_id=s.line_item_id and root.design_id=s.design_id
          and root.catalog_version='custom-override-v1'
          and root.internal_cost_snapshot=s.internal_cost_snapshot
          and root.provenance_snapshot->>'mode'='custom_override'
          and root.provenance_snapshot->>'internalOnly'='true'
          and root.provenance_snapshot->>'manualLinePrice'='true'
          and root.provenance_snapshot->>'costResolution'='unresolved'
      )))
    from public.sales_quote_v2_price_snapshots s where s.id=p_snapshot_id),false);
$$;
revoke all on function public.quote_v2_manual_unknown_cost(uuid) from public,anon,authenticated;
grant execute on function public.quote_v2_manual_unknown_cost(uuid) to service_role;

do $migration$
declare
  definition text;
  updated text;
  old_condition text := $old$(v_line.snapshot_catalog_version='custom-override-v1' and v_line.provenance_snapshot->>'mode'='custom_override' and v_line.provenance_snapshot->>'internalOnly'='true' and v_line.provenance_snapshot->>'manualLinePrice'='true' and v_line.provenance_snapshot->>'costResolution'='unresolved' and v_line.internal_cost_snapshot->>'status'='unresolved' and v_line.internal_cost_snapshot->>'landedCostTotal' is null)$old$;
  old_reservation text := $old$(s.catalog_version='custom-override-v1' and s.provenance_snapshot->>'mode'='custom_override' and s.provenance_snapshot->>'costResolution'='unresolved' and s.internal_cost_snapshot->>'status'='unresolved' and s.internal_cost_snapshot->>'landedCostTotal' is null)$old$;
begin
  definition := pg_get_functiondef('public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure);
  if position('quote_v2_manual_unknown_cost' in definition)=0 then
    updated := replace(definition,old_condition,'public.quote_v2_manual_unknown_cost(v_line.snapshot_id)');
    if updated=definition then raise exception 'Native manual projection target changed'; end if;
    updated := replace(updated,replace(replace(old_condition,'v_line.snapshot_catalog_version','snapshots.catalog_version'),'v_line.','snapshots.'),'public.quote_v2_manual_unknown_cost(snapshots.id)');
    execute updated;
  end if;
  definition := pg_get_functiondef('public.reserve_native_quote_delivery(uuid,uuid,bigint,text,jsonb,jsonb)'::regprocedure);
  if position('quote_v2_manual_unknown_cost' in definition)=0 then
    updated := replace(definition,old_reservation,'public.quote_v2_manual_unknown_cost(s.id)');
    if updated=definition then raise exception 'Native manual reservation target changed'; end if;
    execute updated;
  end if;
  definition := pg_get_functiondef('public.set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean)'::regprocedure);
  if position('quote_v2_manual_unknown_cost' in definition)=0 then
    updated := replace(definition,
      $old$case when source_snapshot.id is null then 'unresolved' else 'preserved_snapshot' end$old$,
      $new$case when source_snapshot.id is null or public.quote_v2_manual_unknown_cost(source_snapshot.id) then 'unresolved' else 'preserved_snapshot' end$new$);
    if updated=definition then raise exception 'Manual cost provenance target changed'; end if;
    execute updated;
  end if;
end $migration$;
