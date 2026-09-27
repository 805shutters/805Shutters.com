-- Staff-entered prices need no catalog match. Build descriptive customer
-- metadata locally during preparation; never rewrite selections or snapshots.
do $migration$
declare
  definition text;
  updated text;
  anchor text := $anchor$    if (v_line.snapshot_catalog_version='custom-override-v1' and v_line.provenance_snapshot->>'mode'='custom_override'$anchor$;
begin
  definition := pg_get_functiondef('public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure);
  updated := replace(definition, '      designs.quote_v2_selection,', '      to_jsonb(designs) as manual_design,
      designs.quote_v2_selection,');
  if updated = definition then raise exception 'Native manual design projection target changed.'; end if;
  definition := updated;
  updated := replace(definition, anchor, $patch$    if v_line.quote_v2_selection is null
      and v_line.provenance_snapshot->>'mode'='custom_override'
      and v_line.provenance_snapshot->>'internalOnly'='true'
      and v_line.provenance_snapshot->>'manualLinePrice'='true' then
      v_line.quote_v2_selection := jsonb_build_object(
        'catalogVersion',v_line.snapshot_catalog_version,
        'manufacturerId',coalesce(nullif(btrim(v_line.manual_design->>'supplier'),''),'custom'),
        'productId',coalesce(nullif(v_line.retail_snapshot#>>'{retail,productId}',''),'custom'),
        'programId',coalesce(nullif(v_line.retail_snapshot#>>'{retail,programId}',''),'custom'),
        'widthInches',round(coalesce(v_line.width_whole,0)::numeric + case when v_line.width_fraction ~ '^[0-9]+/[1-9][0-9]*$' then split_part(v_line.width_fraction,'/',1)::numeric / split_part(v_line.width_fraction,'/',2)::numeric else 0 end,4),
        'heightInches',round(coalesce(v_line.height_whole,0)::numeric + case when v_line.height_fraction ~ '^[0-9]+/[1-9][0-9]*$' then split_part(v_line.height_fraction,'/',1)::numeric / split_part(v_line.height_fraction,'/',2)::numeric else 0 end,4),
        'quantity',v_line.quantity,
        'configuration',v_line.manual_design || coalesce(v_line.manual_design->'options_json','{}'::jsonb),
        'options','{}'::jsonb);
    end if;
$patch$ || anchor);
  if updated = definition then raise exception 'Native manual selection projection target changed.'; end if;
  execute updated;
end $migration$;
