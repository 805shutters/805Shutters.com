-- Dedicated 805 database only. Do not enable VOICE_805_BOOKING_AUTHORIZED until this function is applied.
-- The calendar row and one staff SMS effect per recipient commit together. Nothing is sent here.
create or replace function public.voice_805_book_confirmed(p_call_id uuid,p_intent_id uuid,p_payload jsonb,p_hash text,p_revision text,p_lead jsonb,p_job jsonb,p_event jsonb,p_proofs jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare phone public.voice_805_state; call jsonb; intent jsonb; result jsonb; prior public.booking_requests; notice jsonb; effects jsonb;
begin
 select * into phone from public.voice_805_state where id='production' for update;
 call:=phone.body->'entities'->'call'->p_call_id::text;
 intent:=call->'bookingIntent';
 if call is null or intent->>'id' is distinct from p_intent_id::text or intent->>'kind' is distinct from 'appointment'
   or intent->'payload' is distinct from p_payload or (intent->>'confirmedAt') is null or (intent->>'playedAt') is null
   or (intent->>'confirmedAt')::numeric < (intent->>'playedAt')::numeric
   or (intent->>'confirmedAt')::numeric - (intent->>'playedAt')::numeric > 60000
 then raise exception 'BOOKING_CONFIRMATION_REQUIRED'; end if;
 select * into prior from public.booking_requests where key=p_call_id;
 if found then
  if prior.request_hash<>p_hash then raise exception 'BOOKING_KEY_REUSED'; end if;
  return prior.response||jsonb_build_object('replayed',true);
 end if;
 if call->>'phase' is distinct from 'message' or call->>'mediaStreamSid' is null
 then raise exception 'BOOKING_CALL_ENDED'; end if;
 p_event:=jsonb_set(p_event,'{notes}',to_jsonb('Booked via agent on the 805 phone line.'::text),true);
 p_event:=jsonb_set(p_event,'{meta}',coalesce(p_event->'meta','{}'::jsonb)||jsonb_build_object('bookingSource','805_phone','bookedVia','agent'),true);
 -- Customer email/SMS stay empty. Jessica's calendar assignment texts both configured staff numbers.
 notice:=jsonb_build_object('bookedVia','agent','channel','sms','assignedTo','Jessica','name',p_lead->>'name','phone',p_lead->>'phone','address',coalesce(p_event->>'location',''),'startAt',p_event->>'start_at','endAt',p_event->>'end_at');
 effects:=jsonb_build_array(
  jsonb_build_object('kind','agent_staff_sms_jessica','payload',notice||jsonb_build_object('recipient','Jessica')),
  jsonb_build_object('kind','agent_staff_sms_mike','payload',notice||jsonb_build_object('recipient','Mike')));
 result:=public.booking_commit(p_call_id,p_hash,p_revision,p_lead,p_job,p_event,p_proofs,effects);
 call:=call||jsonb_build_object('booking',result||jsonb_build_object('verified',true,'intentId',p_intent_id),'bookingAttention',null);
 update public.voice_805_state set body=jsonb_set(phone.body,array['entities','call',p_call_id::text],call),revision=revision+1,updated_at=now() where id='production';
 return result;
end $$;
revoke all on function public.voice_805_book_confirmed(uuid,uuid,jsonb,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.voice_805_book_confirmed(uuid,uuid,jsonb,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;
