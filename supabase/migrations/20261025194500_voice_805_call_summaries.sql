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
  v_customer_id uuid;
  v_job_id uuid;
  v_job_ids uuid[];
  v_phone text;
  v_summary text;
  v_outcome text;
  v_detached boolean;
  v_metadata jsonb;
  v_payload jsonb;
begin
  if p_call_sid is null or length(btrim(p_call_sid)) < 2 or p_customer_id is null then
    return jsonb_build_object('saved', false, 'reason', 'no-identity');
  end if;
  select customer.id into v_customer_id
  from public.crm_customers customer
  where customer.id = p_customer_id
    and (customer.meta->>'deleted_at') is null;
  if v_customer_id is null then
    return jsonb_build_object('saved', false, 'reason', 'no-identity');
  end if;
  v_summary := left(btrim(coalesce(p_summary, '')), 4000);
  if v_summary = '' then
    return jsonb_build_object('saved', false, 'reason', 'empty');
  end if;
  v_phone := public.voice_805_normalize_phone(coalesce(p_phone, ''));
  v_outcome := left(coalesce(nullif(btrim(p_outcome), ''), 'incomplete'), 80);
  v_detached := coalesce(p_stream_detached, false);
  if v_detached and position('The staff takeover portion cannot be summarized because the stream detached.' in v_summary) = 0 then
    v_summary := left(v_summary || ' The staff takeover portion cannot be summarized because the stream detached.', 4000);
  end if;
  v_metadata := jsonb_build_object('call_sid', btrim(p_call_sid), 'outcome', v_outcome, 'stream_detached', v_detached, 'description', v_summary);
  v_payload := jsonb_build_object('summary', v_summary, 'outcome', v_outcome, 'stream_detached', v_detached);
  insert into public.crm_activity_events(actor_email, entity_type, entity_id, action, after_data, metadata)
  values ('voice-805@805shutters.com', 'customer', v_customer_id, 'voice_805_call', v_payload, v_metadata)
  on conflict (entity_type, entity_id, (metadata->>'call_sid'))
  where action = 'voice_805_call'
  do update set after_data = excluded.after_data, metadata = excluded.metadata;
  if v_phone is not null then
    select coalesce(array_agg(job.id), '{}') into v_job_ids
    from public.crm_jobs job
    where public.voice_805_normalize_phone(job.phone) = v_phone
      and (job.meta->>'deleted_at') is null
      and (
        exists (
          select 1 from public.crm_customer_contracts contract
          where contract.job_id = job.id
            and contract.customer_id = v_customer_id
            and (contract.meta->>'deleted_at') is null
        )
        or exists (
          select 1 from public.crm_customer_products product
          where product.job_id = job.id
            and product.customer_id = v_customer_id
            and (product.meta->>'deleted_at') is null
        )
      );
    if cardinality(v_job_ids) = 1 then
      v_job_id := v_job_ids[1];
      insert into public.crm_activity_events(actor_email, entity_type, entity_id, action, after_data, metadata)
      values ('voice-805@805shutters.com', 'job', v_job_id, 'voice_805_call', v_payload || jsonb_build_object('customer_id', v_customer_id), v_metadata)
      on conflict (entity_type, entity_id, (metadata->>'call_sid'))
      where action = 'voice_805_call'
      do update set after_data = excluded.after_data, metadata = excluded.metadata;
    end if;
  end if;
  return jsonb_build_object('saved', true, 'customer_id', v_customer_id, 'job_id', v_job_id);
end;
$$;

revoke all on function public.voice_805_save_summary(text, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.voice_805_save_summary(text, uuid, text, text, text, boolean) to service_role;
