-- A quote group organizes proposals; it is not a single-purchase constraint.
-- Distinct contracts retain their frozen prices, tokens and per-quote receipts.
-- Existing signatures and financial records are never rewritten.
drop index if exists public.crm_quotes_one_signed_per_group;

do $migration$
declare definition text; original text; target regprocedure;
begin
 target := 'public.accept_native_quote_delivery(uuid,text,text[],numeric,timestamptz,text,text)'::regprocedure;
 definition := pg_get_functiondef(target); original := definition;
 definition := replace(definition,
  $old$ or exists(select 1 from public.crm_quotes where quote_group_id=q.quote_group_id and id<>q.id and (signed_at is not null or meta ? 'native_staff_sale'))$old$, '');
 definition := replace(definition,
  $old$ update public.crm_quotes set quote_label=case when quote_label like 'Pending Quote%' then quote_label else 'Pending Quote '||coalesce(quote_label,'') end,meta=meta||jsonb_build_object('native_superseded_by_quote_id',q.id) where quote_group_id=q.quote_group_id and id<>q.id and signed_at is null;$old$,
  $new$ -- Other contracts remain independently available to sign.$new$);
 if definition = original and position('Other contracts remain independently' in definition)=0 then raise exception 'Native acceptance definition changed'; end if;
 if position('exists(select 1 from public.crm_quotes where quote_group_id=q.quote_group_id' in definition)>0 or
    position('native_superseded_by_quote_id' in definition)>0 then raise exception 'Native sibling acceptance guard remains'; end if;
 if position('q.signed_at is not null' in definition)=0 then raise exception 'Native per-contract signature protection missing'; end if;
 execute definition;

 foreach target in array array[
  'public.claim_native_quote_delivery_attempt(uuid,uuid)'::regprocedure,
  'public.reserve_native_quote_resend(uuid,uuid,bigint,text,text,jsonb)'::regprocedure,
  'public.native_quote_delivery_capability(uuid,uuid)'::regprocedure
 ] loop
  definition := pg_get_functiondef(target); original := definition;
  definition := replace(definition,
   $old$ or exists(select 1 from public.crm_quotes sibling where sibling.quote_group_id=q.quote_group_id and sibling.signed_at is not null)$old$, '');
  definition := replace(definition,
   $old$ or (cq.quote_group_id=q.quote_group_id and cq.signed_at is not null)$old$, '');
  definition := regexp_replace(definition,
   $old$ or[[:space:]]+\(cq.quote_group_id=q.quote_group_id and cq.signed_at is not null\)$old$, '', 'g');
  if position('sibling.quote_group_id=q.quote_group_id and sibling.signed_at is not null' in definition)>0 or
     position('cq.quote_group_id=q.quote_group_id and cq.signed_at is not null' in definition)>0 then
    raise exception 'Native sibling delivery guard remains: %', target;
  end if;
  if position('q.signed_at is not null' in definition)=0 then raise exception 'Native per-contract delivery protection missing: %', target; end if;
  execute definition;
 end loop;
end $migration$;
