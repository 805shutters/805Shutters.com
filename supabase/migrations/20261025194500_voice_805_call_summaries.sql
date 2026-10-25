-- Reviewed with the phone branch. Do not apply to production from this change.
-- Does not drop voice_805_save_callback or historical crm_callback_items.recording_url values.

create unique index if not exists voice_805_call_summary_idx
  on public.crm_activity_events (entity_type, entity_id, (metadata->>'call_sid'))
  where action = 'voice_805_call';

create function public.voice_805_save_summary(
  p_call_sid text,
  p_customer_id uuid,
  p_phone text,
  p_summary text,
  p_outcome text,
  p_stream_detached boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  customer_id uuid;
  job_id uuid;
  job_count integer;
  phone text;
  summary text;
  outcome text;
  detached boolean;
  meta jsonb;
  payload jsonb;
  existing uuid;
begin
  if p_call_sid is null or length(btrim(p_call_sid)) < 2 or p_customer_id is null then
    return jsonb_build_object('saved', false, 'reason', 'no-identity');
  end if;
  select id into customer_id from public.crm_customers
  where id = p_customer_id and (meta->>'deleted_at') is null;
  if customer_id is null then
    return jsonb_build_object('saved', false, 'reason', 'no-identity');
  end if;
  summary := left(btrim(coalesce(p_summary, '')), 4000);
  if summary = '' then
    return jsonb_build_object('saved', false, 'reason', 'empty');
  end if;
  phone := public.voice_805_normalize_phone(coalesce(p_phone, ''));
  outcome := left(coalesce(nullif(btrim(p_outcome), ''), 'incomplete'), 80);
  detached := coalesce(p_stream_detached, false);
  if detached and position('The staff takeover portion cannot be summarized because the stream detached.' in summary) = 0 then
    summary := left(summary || ' The staff takeover portion cannot be summarized because the stream detached.', 4000);
  end if;
  meta := jsonb_build_object('call_sid', btrim(p_call_sid), 'outcome', outcome, 'stream_detached', detached, 'description', summary);
  payload := jsonb_build_object('summary', summary, 'outcome', outcome, 'stream_detached', detached);
  select id into existing from public.crm_activity_events
  where action = 'voice_805_call' and entity_type = 'customer' and entity_id = customer_id and metadata->>'call_sid' = btrim(p_call_sid)
  order by created_at desc limit 1;
  if existing is null then
    insert into public.crm_activity_events(actor_email, entity_type, entity_id, action, after_data, metadata)
    values ('voice-805@805shutters.com', 'customer', customer_id, 'voice_805_call', payload, meta);
  else
    update public.crm_activity_events set after_data = payload, metadata = meta where id = existing;
  end if;
  if phone is not null then
    select count(*) into job_count from public.crm_jobs
    where public.voice_805_normalize_phone(phone) = phone and (meta->>'deleted_at') is null;
    if job_count = 1 then
      select id into job_id from public.crm_jobs
      where public.voice_805_normalize_phone(phone) = phone and (meta->>'deleted_at') is null;
      existing := null;
      select id into existing from public.crm_activity_events
      where action = 'voice_805_call' and entity_type = 'job' and entity_id = job_id and metadata->>'call_sid' = btrim(p_call_sid)
      order by created_at desc limit 1;
      if existing is null then
        insert into public.crm_activity_events(actor_email, entity_type, entity_id, action, after_data, metadata)
        values ('voice-805@805shutters.com', 'job', job_id, 'voice_805_call', payload || jsonb_build_object('customer_id', customer_id), meta);
      else
        update public.crm_activity_events set after_data = payload || jsonb_build_object('customer_id', customer_id), metadata = meta where id = existing;
      end if;
    end if;
  end if;
  return jsonb_build_object('saved', true, 'customer_id', customer_id, 'job_id', job_id);
exception when unique_violation then
  return jsonb_build_object('saved', true, 'customer_id', customer_id, 'job_id', job_id, 'duplicate', true);
end;
$$;

revoke all on function public.voice_805_save_summary(text, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.voice_805_save_summary(text, uuid, text, text, text, boolean) to service_role;
