-- A design with no catalog selection is stored as SQL NULL, JSON null, or {}.
-- Project descriptive metadata for all three representations, only when the
-- immutable price snapshot proves an audited staff override. Keep nonempty
-- selections subject to the existing consistency checks. This changes no
-- saved quote, design, price, fingerprint, or snapshot.
do $migration$
declare
  definition text;
  updated text;
  old_guard text := $old$    if v_line.quote_v2_selection is null
      and v_line.provenance_snapshot->>'mode'='custom_override'$old$;
  new_guard text := $new$    if (v_line.quote_v2_selection is null
        or v_line.quote_v2_selection in ('null'::jsonb, '{}'::jsonb))
      and v_line.provenance_snapshot->>'mode'='custom_override'$new$;
begin
  definition := pg_get_functiondef('public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure);
  if position(new_guard in definition) > 0 then return; end if;
  updated := replace(definition, old_guard, new_guard);
  if updated = definition then
    raise exception 'Native missing manual selection projection target changed.';
  end if;
  execute updated;
end $migration$;
