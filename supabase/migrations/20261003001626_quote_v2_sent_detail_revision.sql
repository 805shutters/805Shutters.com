-- Preserve the finalized source and apply a structural edit to its copied draft
-- in one transaction. Keep the existing actor, accepted-window and price guards.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_sales_quote_revision(uuid,uuid,uuid,bigint,text,uuid,text,numeric)'::regprocedure) into definition;
  if position('p_action not in (''delete'',''manual-price'')' in definition)=0
    or position('update public.sales_quote_line_items set archived_at=now() where id=target_line_id;' in definition)=0
    or position('''revision'',copied.quote_v2_revision,''total'',copied.total_amount' in definition)=0 then
    raise exception 'Expected the current guarded finalized-quote revision function.';
  end if;
  definition:=replace(definition,'p_action not in (''delete'',''manual-price'')','p_action not in (''delete'',''manual-price'',''copy'')');
  definition:=replace(definition,'if p_action=''delete'' and (p_variant is not null or p_unit_price is not null)',
    'if p_action in (''delete'',''copy'') and (p_variant is not null or p_unit_price is not null)');
  definition:=replace(definition,'update public.sales_quote_line_items set archived_at=now() where id=target_line_id;',
    'if p_action=''delete'' then update public.sales_quote_line_items set archived_at=now() where id=target_line_id; end if;');
  definition:=replace(definition,'''revision'',copied.quote_v2_revision,''total'',copied.total_amount',
    '''revision'',copied.quote_v2_revision,''total'',copied.total_amount,''identityMap'',identities');
  -- Stack metadata contains serialized line IDs, which must refer to the copy.
  definition:=replace(definition,'  select * into copied from public.sales_quotes where id=new_quote_id;',
$notes$  if source.installer_notes is not null and left(ltrim(source.installer_notes),1)='{' then
    begin
      update public.sales_quotes set installer_notes=public.quote_revision_remap_ids(source.installer_notes::jsonb,identities)::text where id=new_quote_id;
    exception when invalid_text_representation then null;
    end;
  end if;
  select * into copied from public.sales_quotes where id=new_quote_id;$notes$);
  execute definition;
end $$;

create or replace function public.revise_quote_v2_structure(
  p_quote_id uuid,p_expected_revision bigint,p_idempotency_key text,
  p_actor_id uuid,p_operations jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  anchor_id uuid; request_id uuid; digest text; copied jsonb; identities jsonb;
  operations jsonb; result jsonb; entry record; op jsonb;
begin
  -- The copy RPC repeats staff authorization and locks the exact source row.
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) not between 1 and 200 then
    raise exception 'A valid structural revision request is required.' using errcode='22023';
  end if;
  if not exists(select 1 from public.sales_quotes where id=p_quote_id and quote_v2_backend) then
    raise exception 'An authoritative V2 source quote is required.' using errcode='22023';
  end if;
  select id into anchor_id from public.sales_quote_line_items
    where quote_id=p_quote_id and archived_at is null
      and public.quote_revision_accepted_quantities(p_quote_id) ? id::text
    order by sort_order,id limit 1;
  if anchor_id is null then raise exception 'No accepted active line is available to revise.' using errcode='55000'; end if;
  digest:=md5(p_quote_id::text||':'||p_actor_id::text||':'||p_idempotency_key);
  request_id:=(substr(digest,1,8)||'-'||substr(digest,9,4)||'-4'||substr(digest,14,3)||'-8'||substr(digest,18,3)||'-'||substr(digest,21,12))::uuid;
  copied:=public.create_sales_quote_revision(p_quote_id,p_actor_id,request_id,p_expected_revision,'copy',anchor_id,null,null);
  identities:=copied->'identityMap';
  operations:=public.quote_revision_remap_ids(p_operations,identities);
  -- Notes are serialized JSON in the API contract rather than a JSON object.
  for entry in select value,ordinality from jsonb_array_elements(operations) with ordinality loop
    op:=entry.value;
    if op->>'type'='quote.update' and op#>>'{patch,installerNotes}' is not null then
      begin
        op:=jsonb_set(op,'{patch,installerNotes}',to_jsonb(public.quote_revision_remap_ids((op#>>'{patch,installerNotes}')::jsonb,identities)::text));
      exception when invalid_text_representation then null;
      end;
      operations:=jsonb_set(operations,array[(entry.ordinality-1)::text],op);
    end if;
  end loop;
  result:=public.mutate_quote_v2_structure((copied->>'quoteId')::uuid,(copied->>'revision')::bigint,
    p_idempotency_key,p_actor_id,operations);
  return result||jsonb_build_object('sourceQuoteId',p_quote_id,'identityMap',identities);
exception when raise_exception then
  raise exception '%',sqlerrm using errcode='55000';
end $$;
revoke all on function public.revise_quote_v2_structure(uuid,bigint,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.revise_quote_v2_structure(uuid,bigint,text,uuid,jsonb) to service_role;
