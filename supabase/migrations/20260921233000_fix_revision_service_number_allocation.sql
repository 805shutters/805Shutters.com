-- The browser allocator requires auth.uid(), which service-role requests do not
-- carry. Keep its authorization unchanged. The revision RPC already validates
-- its explicit staff actor; use the native-draft allocator under the same lock.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_sales_quote_revision(uuid,uuid,uuid,bigint,text,uuid,text,numeric)'::regprocedure) into definition;
  if position('public.next_quote_number(''805'')' in definition)=0
    or position('group_id:=new_quote_id;letter:=''A'';' in definition)=0
    or position('auth.role() is distinct from ''service_role''' in definition)=0
    or position('id=p_actor_id and active=true' in definition)=0 then
    raise exception 'Revision allocator migration expected the actor-validated revision function.';
  end if;
  definition:=replace(definition,'  group_id uuid; letter text;','  group_id uuid; letter text; revision_quote_number text; next_number integer;');
  definition:=replace(definition,'  group_id:=new_quote_id;letter:=''A'';',
$allocator$  group_id:=new_quote_id;letter:='A';
  perform pg_advisory_xact_lock(hashtextextended('quote-v2-number-allocation:805',0));
  select coalesce(max(nullif(regexp_replace(split_part(quote_number,'-',2),'[^0-9]','','g'),'')::integer),0)+1
    into next_number from public.sales_quotes
    where account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid and quote_number like '805-%';
  revision_quote_number:='805-'||lpad(next_number::text,4,'0');$allocator$);
  definition:=replace(definition,'public.next_quote_number(''805'')','revision_quote_number');
  execute definition;
end $$;
