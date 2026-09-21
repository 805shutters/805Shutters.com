-- Keep the customer-safe SQL allow-list aligned with the current DTO fields.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.quote_v2_customer_safe_configuration(jsonb)'::regprocedure);
 definition:=replace(definition,'v_allowed_keys constant text[] := array[',$new$v_allowed_keys constant text[] := array['temporary_shade','chain_location','dc_power_supply','shared_power_panel_id',$new$);
 execute definition;
end $migration$;
