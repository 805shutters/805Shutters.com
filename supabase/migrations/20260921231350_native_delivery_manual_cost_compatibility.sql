-- Manual prices without a supplier quote carry explicit unknown costs.
do $migration$
declare definition text; unresolved text := $condition$(s.catalog_version='custom-override-v1' and s.provenance_snapshot->>'mode'='custom_override' and s.provenance_snapshot->>'costResolution'='unresolved' and s.internal_cost_snapshot->>'status'='unresolved' and s.internal_cost_snapshot->>'landedCostTotal' is null)$condition$;
begin
 definition:=pg_get_functiondef('public.reserve_native_quote_delivery(uuid,uuid,bigint,text,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'public.quote_v2_has_unresolved_quote_cost(s.retail_snapshot,s.internal_cost_snapshot)', 'public.quote_v2_has_unresolved_quote_cost(s.retail_snapshot,s.internal_cost_snapshot) or '||unresolved);
 definition:=replace(definition,$old$case when s.catalog_version='custom-override-v1' then round($old$,'case when '||unresolved||$new$ then null when s.catalog_version='custom-override-v1' then round($new$);
 if position('costResolution' in definition)=0 then raise exception 'Native manual cost target changed'; end if;
 execute definition;
end $migration$;
