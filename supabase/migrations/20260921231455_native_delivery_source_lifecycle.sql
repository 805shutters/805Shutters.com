-- Match the existing sales quote soft-archive lifecycle column.
do $migration$
declare f record;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('reserve_native_quote_delivery','reserve_native_quote_group_delivery','native_quote_delivery_capability','claim_native_quote_delivery_attempt','accept_native_quote_delivery')
 loop
  execute replace(pg_get_functiondef(f.oid),'deleted_at','archived_at');
 end loop;
end $migration$;
