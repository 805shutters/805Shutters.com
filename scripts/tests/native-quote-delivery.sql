-- Run only against an isolated database with all repo migrations applied.
-- Every fixture and assertion rolls back; no provider calls occur.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare actor uuid:=gen_random_uuid(); sq uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); cq uuid:=gen_random_uuid();
 zero_line uuid:=gen_random_uuid(); zero_design uuid:=gen_random_uuid(); prep uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); design uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid();
 receipt jsonb; claim jsonb; r record; n integer; future uuid; token text; accepted numeric;
begin
 insert into auth.users(id) values(actor);
 insert into public.crm_profiles(id,email,role,active) values(actor,'805shutters@gmail.com','owner',true);
 insert into public.sales_quotes(id,quote_number,account_id,customer_name,quote_v2_backend,quote_v2_status,quote_v2_revision,total_amount)
 values(sq,'ISOLATED-NATIVE-TEST','72ccf12a-11c0-4261-8ad0-31af8ad0bbfb','Synthetic Test',true,'priced',1,100.01);
 insert into public.crm_jobs(id,customer_name,phone) values(job,'Synthetic Test','+18055550100');
 insert into public.crm_quotes(id,job_id,quote_total,share_token) values(cq,job,100.01,'test-'||cq);
 insert into public.crm_quote_line_items(id,quote_id,room,width_in,height_in,quantity,sort_order) values(line,cq,'Test',36,60,3,0);
 insert into public.crm_quote_designs(id,line_item_id,product_id,unit_price,price_status) values(design,line,'roller',30,'ok');
 update public.crm_quote_line_items set selected_design_id=design where id=line;
 insert into public.crm_quote_line_items(id,quote_id,room,width_in,height_in,quantity,sort_order) values(zero_line,cq,'Included free item',24,24,1,1);
 insert into public.crm_quote_designs(id,line_item_id,product_id,unit_price,price_status) values(zero_design,zero_line,'roller',0,'ok');
 update public.crm_quote_line_items set selected_design_id=zero_design where id=zero_line;
 insert into public.sales_quote_v2_customer_send_preparations(id,quote_id,quote_revision,catalog_version,retail_total,customer_payload,crm_job_id,crm_quote_id,prepared_via,created_by,idempotency_key)
 values(prep,sq,1,'test',100.01,'{"backend":"authoritative_v2","total":100.01,"lines":[]}',job,cq,'email',actor,'test-'||cq);
 insert into public.sales_quote_v2_deliveries(id,quote_id,preparation_id,crm_quote_id,actor_id,quote_revision,request_key,request,customer_payload,internal_line_costs,share_token)
 values(d,sq,prep,cq,actor,1,'test-'||cq,'{"email":["synthetic@example.invalid"],"sms":[],"note":null,"measureDecision":null}',
 '{"total":100.01}',jsonb_build_object(line::text,jsonb_build_object('quantity',3,'productTotal',30.01,'total',40.01),zero_line::text,jsonb_build_object('quantity',1,'productTotal',0,'total',0)),'test-'||cq);
 update public.sales_quotes set quote_v2_delivery_id=d where id=sq;
 update public.crm_quotes set meta=jsonb_build_object('native_delivery_id',d,'native_frozen_line_totals',jsonb_build_object(line::text,jsonb_build_object('quantity',3,'total',100.01),zero_line::text,jsonb_build_object('quantity',1,'total',0))) where id=cq;
 insert into public.sales_quote_v2_delivery_attempts(id,delivery_id,channel,recipient) values(attempt,d,'email','synthetic@example.invalid');
 -- Financial edits must fail even for service_role.
 begin update public.sales_quotes set total_amount=1 where id=sq; raise exception 'source freeze failed'; exception when sqlstate '55000' then null; end;
 begin update public.crm_quote_line_items set quantity=2 where id=line; raise exception 'line freeze failed'; exception when sqlstate '55000' then null; end;
 begin update public.crm_quotes set meta=meta||jsonb_build_object('signed_selection',jsonb_build_object('lineItemIds',array[line::text||'#1'])) where id=cq; raise exception 'legacy selection injection accepted'; exception when sqlstate '55000' then null; end;
 begin update public.crm_quotes set meta=meta||'{"native_frozen_line_totals":{}}' where id=cq; raise exception 'meta freeze failed'; exception when sqlstate '55000' then null; end;
 -- Only one caller can claim a provider send; unknown outcomes never retry.
 claim:=public.claim_native_quote_delivery_attempt(attempt,actor);
 if claim->>'claimed'<>'true' then raise exception 'initial claim failed'; end if;
 receipt:=public.claim_native_quote_delivery_attempt(attempt,actor);
 if receipt->>'claimed'<>'false' then raise exception 'duplicate claim'; end if;
 receipt:=public.finish_native_quote_delivery_attempt(attempt,actor,(claim#>>'{attempt,claim_token}')::uuid,'{"sent":false,"uncertain":true}');
 if receipt->>'state'<>'uncertain' then raise exception 'unknown state lost'; end if;
 receipt:=public.claim_native_quote_delivery_attempt(attempt,actor);
 if receipt->>'claimed'<>'false' then raise exception 'unknown outcome retried'; end if;
 -- Customer physical slot #2 costs $33.34, slot #3 $33.33; no rounding drift.
 begin perform public.accept_native_quote_delivery(cq,'test-'||cq,array[line::text||'#2'],33.33,now(),'Test','Test'); raise exception 'wrong total accepted'; exception when sqlstate '40001' then null; end;
 begin perform public.accept_native_quote_delivery(cq,'test-'||cq,array['unknown'],33.34,now(),'Test','Test'); raise exception 'unknown line accepted'; exception when sqlstate '40001' then null; end;
 select * into r from public.accept_native_quote_delivery(cq,'test-'||cq,array[line::text||'#2'],33.34,now(),'Test','Test');
 future:=r.future_quote_id;
 if r.already_signed or future is null then raise exception 'partial receipt absent'; end if;
 select quote_total into accepted from public.crm_quotes where id=cq;
 if accepted<>33.34 then raise exception 'selected total drift'; end if;
 select manufacturer_cost into accepted from public.sales_quotes where id=sq;
 if accepted<>10.00 then raise exception 'source manufacturer cost allocation drift'; end if;
 select materials_cost into accepted from public.crm_quotes where id=cq;
 if accepted<>13.34 then raise exception 'native landed cost allocation drift'; end if;
 begin perform public.claim_native_quote_delivery_attempt(attempt,actor); raise exception 'accepted delivery resumed'; exception when sqlstate '40001' then null; end;
 select count(*) into n from public.sales_quote_v2_acceptances where crm_quote_id=cq;
 if n<>1 then raise exception 'acceptance receipt missing'; end if;
 select * into r from public.accept_native_quote_delivery(cq,'test-'||cq,array[line::text||'#2'],33.34,now(),'Test','Test');
 if not r.already_signed or r.future_quote_id<>future then raise exception 'acceptance replay broken'; end if;
 select quote_total,share_token into accepted,token from public.crm_quotes where id=future;
 if accepted<>66.67 or token is null then raise exception 'future total or token missing'; end if;
 select count(*) into n from public.crm_quote_line_items where quote_id=future;
 if n<>2 then raise exception 'free future line lost'; end if;
 select id into line from public.crm_quote_line_items where quote_id=future and quantity=2;
 -- Future contract may itself be partially accepted; it must never overwrite source sale.
 select * into r from public.accept_native_quote_delivery(future,token,array[line::text||'#2'],33.33,now(),'Test','Test');
 select total_amount into accepted from public.sales_quotes where id=sq;
 if accepted<>33.34 then raise exception 'future signature overwrote source'; end if;
 future:=r.future_quote_id;
 select share_token into token from public.crm_quotes where id=future;
 select l.id into line from public.crm_quote_line_items l join public.crm_quotes q on q.id=l.quote_id where q.id=future and (q.meta#>>array['native_frozen_line_totals',l.id::text,'total'])::numeric>0;
 select * into r from public.accept_native_quote_delivery(future,token,array[line::text],33.34,now(),'Test','Test');
 if r.future_quote_id is null then raise exception 'zero dollar future remainder was discarded'; end if;
 select quote_total into accepted from public.crm_quotes where id=r.future_quote_id;
 if accepted<>0 then raise exception 'zero dollar future remainder repriced'; end if;
 select count(*) into n from public.sales_quote_v2_acceptances;
 if n<2 then raise exception 'future acceptance missing'; end if;
 raise notice 'PASS native freeze, claims, unknown delivery, exact partial cents, retry, nested future acceptance';
end $$;
rollback;
