-- Staff-only communication ledger. All access is through authenticated CRM routes.
create table public.crm_quote_hub_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  action text not null check (action in ('interested','savings','inspiration','personal','note','reply')),
  status text not null check (status in ('draft','prepared','sending','sent','unknown','failed','received','note')),
  subject text not null default '', body text not null default '', recipient text,
  actor_email text not null, provider_id text, payload jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index crm_quote_hub_history on public.crm_quote_hub_messages(quote_id, created_at);
create unique index crm_quote_hub_provider_unique on public.crm_quote_hub_messages(provider_id);
create unique index crm_quote_hub_draft_unique on public.crm_quote_hub_messages(quote_id, actor_email, action) where status = 'draft';
create table public.crm_quote_hub_photos (
  id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  title text not null, storage_path text not null unique, content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now()
);
alter table public.crm_quote_hub_messages enable row level security;
alter table public.crm_quote_hub_photos enable row level security;
revoke all on public.crm_quote_hub_messages, public.crm_quote_hub_photos from public, anon, authenticated;
grant all on public.crm_quote_hub_messages, public.crm_quote_hub_photos to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('quote-hub-photos','quote-hub-photos',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create function public.quote_hub_fingerprint(p_quote_id uuid) returns text
language sql stable security invoker set search_path = public as $$
 select md5(to_jsonb(q)::text || coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('designs',
   (select jsonb_agg(to_jsonb(d) order by d.id) from crm_quote_designs d where d.line_item_id=l.id)) order by l.id)::text
   from crm_quote_line_items l where l.quote_id=q.id),'[]')) from crm_quotes q where q.id=p_quote_id;
$$;
revoke all on function public.quote_hub_fingerprint(uuid) from public, anon, authenticated;
grant execute on function public.quote_hub_fingerprint(uuid) to service_role;

-- Atomically claim one reviewed message and copy exact pricing snapshots for its
-- optional offer. Never reprice catalog lines or overwrite the original amount.
create function public.claim_quote_hub_message(p_message_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
 m crm_quote_hub_messages%rowtype; q crm_quotes%rowtype; l crm_quote_line_items%rowtype; d crm_quote_designs%rowtype;
 new_quote uuid; new_line uuid; new_design uuid; selected_new uuid; group_id uuid; token text; offer jsonb; snapshot jsonb;
begin
 select * into m from crm_quote_hub_messages where id=p_message_id for update;
 if not found then raise exception 'Message not found'; end if;
 if m.status <> 'prepared' then return jsonb_build_object('claimed',false,'message',to_jsonb(m)); end if;
 select * into q from crm_quotes where id=m.quote_id for update;
 if q.status <> 'sent' or q.signed_at is not null or nullif(trim(q.customer_signature),'') is not null or q.archived_at is not null then raise exception 'Only unsigned sent quotes can be contacted'; end if;
 if q.quote_group_id is not null and exists(select 1 from crm_quotes where quote_group_id=q.quote_group_id and (signed_at is not null or status in ('sold','approved','ordered','received','installed','invoiced','paid'))) then raise exception 'A quote in this group has already sold'; end if;
 perform 1 from crm_quote_line_items where quote_id=q.id for share;
 perform 1 from crm_quote_designs where line_item_id in(select id from crm_quote_line_items where quote_id=q.id) for share;
 if quote_hub_fingerprint(q.id) is distinct from m.payload->>'fingerprint' then raise exception 'Quote changed after preview. Reload and preview again'; end if;
 if exists(select 1 from crm_quote_hub_messages where quote_id=q.id and id<>m.id and status in ('sending','unknown')) then raise exception 'Another email is awaiting delivery confirmation'; end if;
 if m.action='savings' then
   offer=m.payload->'offer'; new_quote=(m.payload->>'offerId')::uuid; token=m.payload->>'offerToken';
   if offer is null or (offer->>'percent')::numeric <= 0 or (offer->>'percent')::numeric > 50 or (offer->>'total')::numeric >= q.quote_total then raise exception 'Invalid savings offer'; end if;
   group_id=coalesce(q.quote_group_id,gen_random_uuid());
   if q.quote_group_id is null then update crm_quotes set quote_group_id=group_id,quote_label=coalesce(quote_label,'A') where id=q.id; end if;
   snapshot=(q.meta - array['mts_quote_id','contract_snapshot','signed_selection','legacy_source_total_adjustment','lastNudgedAt','communication_hub_managed']) || jsonb_build_object(
     'adjustments',offer->'adjustments','legacy_source_total',offer->'total','legacy_source_total_adjustment',0,
     'createdAsVersionOf',q.id,'communication_offer_of',q.id,'communication_message_id',m.id,'communication_hub_managed',true);
   insert into crm_quotes select (jsonb_populate_record(null::crm_quotes,to_jsonb(q) || jsonb_build_object(
     'id',new_quote,'created_at',now(),'updated_at',now(),'external_source',null,'external_id',null,
     'quote_number',coalesce(q.quote_number,'Quote') || '-O' || left(m.id::text,8),'quote_group_id',group_id,'quote_label','Offer ' || left(m.id::text,8),
     'status','draft','quote_total',offer->'total','discount',offer->'money'->'discountAmount','tax',offer->'money'->'taxAmount',
     'deposit_required',offer->'money'->'depositRequired','balance_due',offer->'money'->'balanceDue',
     'share_token',token,'sent_at',null,'signed_at',null,'approved_at',null,'sold_at',null,'ordered_at',null,'received_at',null,'installed_at',null,'archived_at',null,
     'customer_signature',null,'customer_printed_name',null,'meta',snapshot))).*;
   for l in select * from crm_quote_line_items where quote_id=q.id order by sort_order,id loop
     new_line=gen_random_uuid(); selected_new=null;
     insert into crm_quote_line_items select (jsonb_populate_record(null::crm_quote_line_items,to_jsonb(l) || jsonb_build_object('id',new_line,'quote_id',new_quote,'created_at',now(),'updated_at',now(),'selected_design_id',null,'external_source',null,'external_id',null))).*;
     for d in select * from crm_quote_designs where line_item_id=l.id order by sort_order,id loop
       new_design=gen_random_uuid();
       insert into crm_quote_designs select (jsonb_populate_record(null::crm_quote_designs,to_jsonb(d) || jsonb_build_object('id',new_design,'line_item_id',new_line,'created_at',now(),'updated_at',now(),'external_source',null,'external_id',null))).*;
       if d.id=l.selected_design_id then selected_new=new_design; end if;
     end loop;
     update crm_quote_line_items set selected_design_id=selected_new where id=new_line;
   end loop;
 end if;
 update crm_quotes set meta=coalesce(meta,'{}') || jsonb_build_object('communication_hub_managed',true) where id=q.id;
 update crm_quote_hub_messages set status='sending',updated_at=now() where id=m.id returning * into m;
 return jsonb_build_object('claimed',true,'message',to_jsonb(m));
end;
$$;
revoke all on function public.claim_quote_hub_message(uuid) from public, anon, authenticated;
grant execute on function public.claim_quote_hub_message(uuid) to service_role;

create function public.finish_quote_hub_message(p_message_id uuid,p_provider_id text) returns void
language plpgsql security invoker set search_path=public as $$
declare m crm_quote_hub_messages%rowtype;
begin
 select * into m from crm_quote_hub_messages where id=p_message_id for update;
 if not found or m.status not in ('sending','unknown','sent') then raise exception 'Message was not claimed'; end if;
 update crm_quote_hub_messages set status='sent',provider_id=p_provider_id,updated_at=now() where id=m.id;
 if m.action='savings' then
   update crm_quotes set status='sent',sent_at=coalesce(sent_at,now()) where id=(m.payload->>'offerId')::uuid and status='draft';
 end if;
end;
$$;
revoke all on function public.finish_quote_hub_message(uuid,text) from public, anon, authenticated;
grant execute on function public.finish_quote_hub_message(uuid,text) to service_role;

create function public.mark_quote_hub_managed(p_quote_id uuid) returns void
language sql security invoker set search_path=public as $$
 update crm_quotes set meta=coalesce(meta,'{}') || jsonb_build_object('communication_hub_managed',true) where id=p_quote_id;
$$;
revoke all on function public.mark_quote_hub_managed(uuid) from public, anon, authenticated;
grant execute on function public.mark_quote_hub_managed(uuid) to service_role;
