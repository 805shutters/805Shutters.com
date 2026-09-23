-- Shutter selections include split_tilt in the customer DTO. Preserve the same
-- public setting in SQL so immutable payload comparison does not block delivery.
-- This changes no stored quote, price, recipient, or delivery state.
do $migration$
declare
  definition text;
  marker constant text := 'v_allowed_keys constant text[] := array[';
begin
  definition := pg_get_functiondef('public.quote_v2_customer_safe_configuration(jsonb)'::regprocedure);
  if strpos(definition, marker) = 0 then
    raise exception 'Customer configuration allow-list was not found; migration stopped.';
  end if;
  if strpos(definition, '''split_tilt''') = 0 then
    execute replace(definition, marker, marker || '''split_tilt'',');
  end if;
end $migration$;
