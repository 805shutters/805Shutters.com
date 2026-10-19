-- Dedicated 805 database only. Do not apply until the phone release is reviewed.
-- Callback rows are new. This does not update crm_customers.

alter table public.crm_activity_events drop constraint if exists crm_activity_events_entity_type_check;
alter table public.crm_activity_events
  add constraint crm_activity_events_entity_type_check check (
    entity_type in (
      'job','quote','bookkeeping_entry','bookkeeping_payment','expense','calendar_event',
      'customer','ken_payment','commission_payment','order_cogs_email','settings','session','system','voice_805'
    )
  );

create table public.crm_callback_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers(id),
  appointment_id uuid references public.crm_calendar_events(id),
  caller_name text not null default '',
  callback_number text not null default '',
  reason text not null default '',
  transcript text not null default '',
  recording_url text not null default '',
  call_sid text not null unique,
  call_time timestamptz not null default now(),
  status text not null default 'needs_callback',
  created_at timestamptz not null default now(),
  constraint crm_callback_items_status_check check (status in ('needs_callback','scheduled'))
);
alter table public.crm_callback_items enable row level security;
revoke all on public.crm_callback_items from public, anon, authenticated;
grant select, insert, update on public.crm_callback_items to service_role;

create function public.voice_805_save_callback(p_call_sid text,p_caller_name text,p_callback_number text,p_reason text,p_transcript text,p_recording_url text,p_call_time timestamptz,p_phone text,p_status text,p_appointment_id uuid,p_customer_id uuid)
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
revoke all on function public.voice_805_save_callback(text,text,text,text,text,text,timestamptz,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.voice_805_save_callback(text,text,text,text,text,text,timestamptz,text,text,uuid,uuid) to service_role;

create function public.voice_805_log_failure(p_action text,p_call_id uuid,p_detail text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.crm_activity_events(actor_email,entity_type,entity_id,action,after_data)
  values ('voice-805@805shutters.com','voice_805',p_call_id,left(coalesce(p_action,'voice_805'),80),jsonb_build_object('detail',left(coalesce(p_detail,''),500)));
end $$;
revoke all on function public.voice_805_log_failure(text,uuid,text) from public,anon,authenticated;
grant execute on function public.voice_805_log_failure(text,uuid,text) to service_role;
