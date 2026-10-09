-- Public shape/control choices only; factory geometry stays excluded.
-- Preserve existing function validation, grants, prices and delivery state.
do $migration$
declare
  definition text;
  marker constant text := 'v_allowed_keys constant text[] := array[';
begin
  definition := pg_get_functiondef('public.quote_v2_customer_safe_configuration(jsonb)'::regprocedure);
  if strpos(definition, marker) = 0 then
    raise exception 'Customer configuration allow-list was not found; migration stopped.';
  end if;
  if strpos(definition, '''french_door_cutout_type''') = 0 then
    execute replace(definition, marker, marker || '''arch_style'',''curved_section_tilt'',''top_louver'',''top_shape'',''french_door_cutout_type'',''handle_side'',''quarter_arch_side'',');
  end if;
end $migration$;
