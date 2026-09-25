-- In-person review freezes exactly the same contract, with no delivery attempts.
-- A later explicit Send uses the existing resend ledger and original snapshot.
alter table public.sales_quote_v2_customer_send_preparations
 drop constraint if exists sales_quote_v2_customer_send_preparations_channel_check;
alter table public.sales_quote_v2_customer_send_preparations
 add constraint sales_quote_v2_customer_send_preparations_channel_check
 check (prepared_via in ('email','sms','both','in_person'));

do $migration$
declare definition text; before_definition text; target regprocedure;
begin
 target := 'public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure;
 definition := pg_get_functiondef(target);
 before_definition := definition;
 definition := replace(definition, $old$p_prepared_via not in ('email', 'sms', 'both')$old$,
   $new$p_prepared_via not in ('email', 'sms', 'both', 'in_person')$new$);
 if definition=before_definition then raise exception 'Native preparation channel guard changed'; end if;
 execute definition;

 target := 'public.reserve_native_quote_delivery(uuid,uuid,bigint,text,jsonb,jsonb)'::regprocedure;
 definition := pg_get_functiondef(target);
 before_definition := definition;
 definition := replace(definition,
 $old$if v_channels<1 or v_channels>11 then raise exception 'Select 1-11 delivery recipients.' using errcode='22023'; end if;$old$,
 $new$if p_request->>'purpose' = 'in_person' then
    if v_channels<>0 then raise exception 'In-person review cannot create delivery recipients.' using errcode='22023'; end if;
  elsif v_channels<1 or v_channels>11 then raise exception 'Select 1-11 delivery recipients.' using errcode='22023'; end if;$new$);
 if definition=before_definition then raise exception 'Native recipient guard changed'; end if;
 before_definition := definition;
 definition := replace(definition, $old$coalesce(v_prior_via,case when jsonb_array_length$old$,
  $new$coalesce(v_prior_via,case when p_request->>'purpose'='in_person' then 'in_person' when jsonb_array_length$new$);
 if definition=before_definition then raise exception 'Native preparation channel selection changed'; end if;
 execute definition;

 -- Group retries without a message dispatch return the active frozen receipt.
 target := 'public.reserve_native_quote_group_delivery(uuid,uuid,bigint,text,jsonb,jsonb)'::regprocedure;
 definition := pg_get_functiondef(target);
 before_definition := definition;
 definition := replace(definition,
  $old$if not found then raise exception 'Delivery dispatch receipt missing.' using errcode='55000'; end if;$old$,
  $new$if not found then
    if p_request->>'purpose'='in_person' then return v_active; end if;
    raise exception 'Delivery dispatch receipt missing.' using errcode='55000';
  end if;$new$);
 if definition=before_definition then raise exception 'Native group retry target changed'; end if;
 execute definition;

 -- Select one stable group receipt, including a review which has no attempts.
 foreach target in array array[
 'public.reserve_native_quote_resend(uuid,uuid,bigint,text,text,jsonb)'::regprocedure,
 'public.native_quote_delivery_capability(uuid,uuid)'::regprocedure] loop
   definition := pg_get_functiondef(target);
   before_definition := definition;
   definition := replace(definition,
    $old$and exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=dl.id) order by dl.created_at,dl.id limit 1;$old$,
    $new$and (exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=dl.id) or dl.request->>'purpose'='in_person') order by dl.created_at,dl.id limit 1;$new$);
   if definition=before_definition then raise exception 'Native dispatch selection target changed: %',target; end if;
   if target='public.native_quote_delivery_capability(uuid,uuid)'::regprocedure then
     definition := replace(definition, $old$'supportsResend',true,$old$, $new$'supportsResend',true,'supportsInPerson',true,$new$);

   end if;
   execute definition;
 end loop;
end $migration$;
