-- The rolled-back media bundle calls voice_805_save_callback without p_customer_id.
-- A default keeps that call valid. New code still sends the id when it has one.

create or replace function public.voice_805_save_callback(p_call_sid text,p_caller_name text,p_callback_number text,p_reason text,p_transcript text,p_recording_url text,p_call_time timestamptz,p_phone text,p_status text,p_appointment_id uuid,p_customer_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.crm_callback_items;
begin
  if p_call_sid is null or length(p_call_sid)<2 or p_status not in ('needs_callback','scheduled') then raise exception 'CALLBACK_INVALID'; end if;
  insert into public.crm_callback_items(customer_id,appointment_id,caller_name,callback_number,reason,transcript,recording_url,call_sid,call_time,status)
  values (p_customer_id,p_appointment_id,coalesce(p_caller_name,''),coalesce(p_callback_number,coalesce(p_phone,'')),coalesce(p_reason,''),coalesce(p_transcript,''),coalesce(p_recording_url,''),p_call_sid,coalesce(p_call_time,now()),p_status)
  on conflict (call_sid) do update set
    caller_name=excluded.caller_name,
    callback_number=excluded.callback_number,
    reason=excluded.reason,
    transcript=excluded.transcript,
    recording_url=excluded.recording_url,
    status=excluded.status,
    appointment_id=coalesce(excluded.appointment_id,public.crm_callback_items.appointment_id),
    customer_id=coalesce(public.crm_callback_items.customer_id,excluded.customer_id)
  returning * into saved;
  return to_jsonb(saved);
end $$;

notify pgrst, 'reload schema';
