-- Normalize verified manual-price DTOs locally; never change saved snapshots.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure);
 definition:=replace(definition,$old$    v_selection := v_line.quote_v2_selection;$old$,$new$    if (v_line.snapshot_catalog_version='custom-override-v1' and v_line.provenance_snapshot->>'mode'='custom_override' and v_line.provenance_snapshot->>'internalOnly'='true' and v_line.provenance_snapshot->>'manualLinePrice'='true' and v_line.provenance_snapshot->>'costResolution'='unresolved' and v_line.internal_cost_snapshot->>'status'='unresolved' and v_line.internal_cost_snapshot->>'landedCostTotal' is null) then
      v_line.retail_snapshot:=jsonb_set(v_line.retail_snapshot,'{retail}',
        (v_line.retail_snapshot->'retail') || jsonb_build_object(
          'ok',true,'validationStatus','valid',
          'productId',v_line.quote_v2_selection->>'productId',
          'programId',coalesce(nullif(v_line.retail_snapshot#>>'{retail,programId}',''),nullif(v_line.quote_v2_selection->>'programId',''),'custom'),
          'programName',coalesce(nullif(v_line.retail_snapshot#>>'{retail,programName}',''),'Custom pricing'),
          'matchedWidth',coalesce(v_line.retail_snapshot#>'{retail,matchedWidth}',v_line.quote_v2_selection->'widthInches'),
          'matchedHeight',coalesce(v_line.retail_snapshot#>'{retail,matchedHeight}',v_line.quote_v2_selection->'heightInches')));
      v_line.internal_landed_cost_total:=null;
    end if;
    v_selection := v_line.quote_v2_selection;$new$);
 definition:=replace(definition,$old$if v_line.snapshot_catalog_version = 'custom-override-v1' then$old$,$new$if v_line.snapshot_catalog_version = 'custom-override-v1' and not coalesce((v_line.snapshot_catalog_version='custom-override-v1' and v_line.provenance_snapshot->>'mode'='custom_override' and v_line.provenance_snapshot->>'internalOnly'='true' and v_line.provenance_snapshot->>'manualLinePrice'='true' and v_line.provenance_snapshot->>'costResolution'='unresolved' and v_line.internal_cost_snapshot->>'status'='unresolved' and v_line.internal_cost_snapshot->>'landedCostTotal' is null),false) then$new$);
 definition:=replace(definition,'public.quote_v2_has_unresolved_quote_cost(v_line.retail_snapshot,v_line.internal_cost_snapshot)','(public.quote_v2_has_unresolved_quote_cost(v_line.retail_snapshot,v_line.internal_cost_snapshot) or (v_line.snapshot_catalog_version=''custom-override-v1'' and v_line.provenance_snapshot->>''mode''=''custom_override'' and v_line.provenance_snapshot->>''internalOnly''=''true'' and v_line.provenance_snapshot->>''manualLinePrice''=''true'' and v_line.provenance_snapshot->>''costResolution''=''unresolved'' and v_line.internal_cost_snapshot->>''status''=''unresolved'' and v_line.internal_cost_snapshot->>''landedCostTotal'' is null))');
 definition:=replace(definition,'public.quote_v2_has_unresolved_quote_cost(snapshots.retail_snapshot,snapshots.internal_cost_snapshot)','(public.quote_v2_has_unresolved_quote_cost(snapshots.retail_snapshot,snapshots.internal_cost_snapshot) or (snapshots.catalog_version=''custom-override-v1'' and snapshots.provenance_snapshot->>''mode''=''custom_override'' and snapshots.provenance_snapshot->>''internalOnly''=''true'' and snapshots.provenance_snapshot->>''manualLinePrice''=''true'' and snapshots.provenance_snapshot->>''costResolution''=''unresolved'' and snapshots.internal_cost_snapshot->>''status''=''unresolved'' and snapshots.internal_cost_snapshot->>''landedCostTotal'' is null))');
 if position('manualLinePrice' in definition)=0 then raise exception 'Native preparation target changed'; end if;
 execute definition;
end $migration$;
