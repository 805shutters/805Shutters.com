-- Atomic existing-CRM-job links and durable private photos for mobile Quote V2.
-- Additive schema only: no existing customer, quote, or object records are changed.

create or replace function public.create_mobile_quote_v2_draft(
  p_idempotency_key text,
  p_actor_id uuid,
  p_created_job_id uuid,
  p_quote_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_result jsonb;
  v_quote_id uuid;
  v_relationship_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Mobile Quote V2 draft creation requires the service role.'
      using errcode = '42501';
  end if;
  if p_created_job_id is null then
    raise exception 'A selected CRM job is required.' using errcode = '22023';
  end if;
  perform jobs.id
    from public.crm_jobs jobs
   where jobs.id = p_created_job_id
     and coalesce(jobs.meta ->> 'deleted_at', '') = ''
   for share;
  if not found then
    raise exception 'The selected CRM job is missing or deleted.' using errcode = 'P0002';
  end if;

  -- The server-only key binds the immutable relationship into the canonical
  -- create RPC's request hash. The canonical function ignores it as a contact
  -- field but persists the same retry result for identical inputs.
  v_result := public.create_quote_v2_draft(
    p_idempotency_key,
    p_actor_id,
    p_quote_patch || jsonb_build_object('mobileCreatedJobId', p_created_job_id)
  );
  begin
    v_quote_id := (v_result ->> 'quoteId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Canonical Quote V2 creation returned an invalid quote identity.'
      using errcode = '55000';
  end;

  update public.sales_quotes quotes
     set created_job_id = p_created_job_id
   where quotes.id = v_quote_id
     and quotes.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
     and quotes.created_by = p_actor_id
     and quotes.created_job_id is null;
  get diagnostics v_relationship_count = row_count;
  if v_relationship_count = 0 and not exists (
    select 1
      from public.sales_quotes quotes
     where quotes.id = v_quote_id
       and quotes.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
       and quotes.created_by = p_actor_id
       and quotes.created_job_id = p_created_job_id
  ) then
    raise exception 'The mobile quote relationship conflicts with the persisted draft.'
      using errcode = '23505';
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_mobile_quote_v2_draft(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_mobile_quote_v2_draft(text, uuid, uuid, jsonb)
  to service_role;
comment on function public.create_mobile_quote_v2_draft(text, uuid, uuid, jsonb) is
  'Atomically creates an idempotent 805 Quote V2 draft and binds a verified, non-deleted CRM job identity.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mobile-quote-photos',
  'mobile-quote-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

create table if not exists public.mobile_quote_photos (
  photo_id uuid primary key,
  account_id uuid not null,
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  line_item_id uuid not null references public.sales_quote_line_items(id) on delete cascade,
  created_by uuid not null,
  object_path text not null unique,
  mime_type text not null,
  byte_size integer not null,
  sha256 text not null,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mobile_quote_photos_account_check
    check (account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid),
  constraint mobile_quote_photos_mime_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint mobile_quote_photos_size_check
    check (byte_size between 1 and 2097152),
  constraint mobile_quote_photos_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint mobile_quote_photos_path_check
    check (object_path = account_id::text || '/' || quote_id::text || '/' || line_item_id::text || '/' || photo_id::text)
);

create index if not exists mobile_quote_photos_quote_line_idx
  on public.mobile_quote_photos (quote_id, line_item_id, created_at, photo_id);

alter table public.mobile_quote_photos enable row level security;
revoke all on public.mobile_quote_photos from public, anon, authenticated;
grant all on public.mobile_quote_photos to service_role;

-- No storage.objects policies are created. The private bucket is accessed only
-- by authenticated CRM server routes through the service role.
