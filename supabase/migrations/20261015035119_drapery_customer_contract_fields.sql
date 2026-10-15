-- Public drapery descriptions only. Preserve validation, privileges and pricing.
-- No table, customer-row, money, lifecycle or authentication changes.
do $migration$
declare
  definition text;
  marker constant text := 'v_allowed_keys constant text[] := array[';
begin
  definition := pg_get_functiondef('public.quote_v2_customer_safe_configuration(jsonb)'::regprocedure);
  if strpos(definition, marker) = 0 then
    raise exception 'Customer configuration allow-list was not found; migration stopped.';
  end if;
  if strpos(definition, '''drapery_style''') = 0 then
    execute replace(definition, marker, marker || '''drapery_style'',''drapery_description'',''drapery_hardware'',''drapery_lining'',''drapery_fullness'',''drapery_draw'',''drapery_details'',');
  end if;
end $migration$;
