-- Explicit, preview-first conversion of unsent legacy sales-quote drafts.
--
-- This migration is additive and does not convert or reprice any existing row.
-- A legacy draft remains untouched until trusted server code records a preview
-- and then calls the apply RPC with the exact preview identity, quote revision,
-- selected-design map, authoritative pricing batch, and idempotency key.

create or replace function public.quote_v2_customer_payload_has_protected_key(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_child jsonb;
  v_normalized_key text;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      v_normalized_key := lower(regexp_replace(v_key, '[^a-zA-Z0-9]', '', 'g'));
      if v_normalized_key ~ '(cost|dealer|wholesale|freight|oversize|margin|multiplier|factor|processingfee)' then
        return true;
      end if;
      if public.quote_v2_customer_payload_has_protected_key(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if public.quote_v2_customer_payload_has_protected_key(v_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function public.quote_v2_customer_payload_has_protected_key(jsonb)
  from public, anon, authenticated;
grant execute on function public.quote_v2_customer_payload_has_protected_key(jsonb)
  to service_role;

create table if not exists public.sales_quote_v2_legacy_reprice_previews (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  quote_revision bigint not null,
  preview_digest text not null,
  legacy_state_hash text not null,
  pricing_batch_hash text not null,
  server_catalog_date date not null,
  selection_map jsonb not null,
  line_count integer not null,
  legacy_total numeric(12, 2) not null,
  proposed_total numeric(12, 2) not null,
  customer_payload jsonb not null,
  created_by uuid not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint sales_quote_v2_legacy_preview_revision_check
    check (quote_revision >= 0),
  constraint sales_quote_v2_legacy_preview_digest_check
    check (preview_digest ~ '^sha256:[0-9a-f]{64}$'),
  constraint sales_quote_v2_legacy_preview_state_hash_check
    check (legacy_state_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint sales_quote_v2_legacy_preview_batch_hash_check
    check (pricing_batch_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint sales_quote_v2_legacy_preview_selection_check
    check (jsonb_typeof(selection_map) = 'array'),
  constraint sales_quote_v2_legacy_preview_line_count_check
    check (line_count between 1 and 40),
  constraint sales_quote_v2_legacy_preview_money_check
    check (legacy_total >= 0 and proposed_total >= 0),
  constraint sales_quote_v2_legacy_preview_customer_payload_check
    check (
      jsonb_typeof(customer_payload) = 'object'
      and not public.quote_v2_customer_payload_has_protected_key(customer_payload)
    ),
  constraint sales_quote_v2_legacy_preview_expiry_check
    check (expires_at > created_at),
  constraint sales_quote_v2_legacy_preview_idempotency_uniq
    unique (quote_id, idempotency_key)
);

create unique index if not exists sales_quote_v2_legacy_preview_digest_uniq
  on public.sales_quote_v2_legacy_reprice_previews (quote_id, preview_digest);

create index if not exists sales_quote_v2_legacy_preview_quote_created_idx
  on public.sales_quote_v2_legacy_reprice_previews (quote_id, created_at desc);

create table if not exists public.sales_quote_v2_legacy_reprice_audits (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  preview_id uuid not null references public.sales_quote_v2_legacy_reprice_previews(id) on delete restrict,
  pricing_event_id uuid not null references public.sales_quote_v2_events(id) on delete restrict,
  previous_revision bigint not null,
  new_revision bigint not null,
  preview_digest text not null,
  legacy_state_hash text not null,
  pricing_batch_hash text not null,
  quote_status text not null,
  quote_total numeric(12, 2) not null,
  priced_design_count integer not null,
  blocked_design_count integer not null,
  customer_payload jsonb not null,
  actor_id uuid not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_legacy_audit_revision_check
    check (previous_revision >= 0 and new_revision > previous_revision),
  constraint sales_quote_v2_legacy_audit_digest_check
    check (preview_digest ~ '^sha256:[0-9a-f]{64}$'),
  constraint sales_quote_v2_legacy_audit_state_hash_check
    check (legacy_state_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint sales_quote_v2_legacy_audit_batch_hash_check
    check (pricing_batch_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint sales_quote_v2_legacy_audit_total_check
    check (quote_total >= 0),
  constraint sales_quote_v2_legacy_audit_count_check
    check (priced_design_count between 0 and 40 and blocked_design_count between 0 and 40),
  constraint sales_quote_v2_legacy_audit_customer_payload_check
    check (
      jsonb_typeof(customer_payload) = 'object'
      and not public.quote_v2_customer_payload_has_protected_key(customer_payload)
    ),
  constraint sales_quote_v2_legacy_audit_preview_uniq unique (preview_id),
  constraint sales_quote_v2_legacy_audit_event_uniq unique (pricing_event_id),
  constraint sales_quote_v2_legacy_audit_idempotency_uniq unique (quote_id, idempotency_key)
);

alter table public.sales_quote_v2_legacy_reprice_previews enable row level security;
alter table public.sales_quote_v2_legacy_reprice_audits enable row level security;

revoke all on public.sales_quote_v2_legacy_reprice_previews from anon, authenticated;
revoke all on public.sales_quote_v2_legacy_reprice_audits from anon, authenticated;
grant select on public.sales_quote_v2_legacy_reprice_previews to authenticated;
grant select on public.sales_quote_v2_legacy_reprice_audits to authenticated;
grant all on public.sales_quote_v2_legacy_reprice_previews to service_role;
grant all on public.sales_quote_v2_legacy_reprice_audits to service_role;

drop policy if exists "805 CRM users read legacy V2 reprice previews"
  on public.sales_quote_v2_legacy_reprice_previews;
create policy "805 CRM users read legacy V2 reprice previews"
on public.sales_quote_v2_legacy_reprice_previews
for select
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

drop policy if exists "805 CRM users read legacy V2 reprice audits"
  on public.sales_quote_v2_legacy_reprice_audits;
create policy "805 CRM users read legacy V2 reprice audits"
on public.sales_quote_v2_legacy_reprice_audits
for select
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

drop trigger if exists sales_quote_v2_legacy_previews_append_only
  on public.sales_quote_v2_legacy_reprice_previews;
create trigger sales_quote_v2_legacy_previews_append_only
before update or delete
on public.sales_quote_v2_legacy_reprice_previews
for each row
execute function public.reject_v2_audit_mutation();

drop trigger if exists sales_quote_v2_legacy_audits_append_only
  on public.sales_quote_v2_legacy_reprice_audits;
create trigger sales_quote_v2_legacy_audits_append_only
before update or delete
on public.sales_quote_v2_legacy_reprice_audits
for each row
execute function public.reject_v2_audit_mutation();

create or replace function public.quote_v2_legacy_state_hash(p_quote_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select 'sha256:' || encode(
    digest(
      convert_to(
        jsonb_build_object(
          'quote', to_jsonb(quotes),
          'lines', coalesce((
            select jsonb_agg(to_jsonb(lines) order by lines.sort_order, lines.id)
            from public.sales_quote_line_items lines
            where lines.quote_id = quotes.id
          ), '[]'::jsonb),
          'designs', coalesce((
            select jsonb_agg(to_jsonb(designs) order by designs.line_item_id, designs.variant, designs.id)
            from public.sales_quote_designs designs
            join public.sales_quote_line_items lines
              on lines.id = designs.line_item_id
            where lines.quote_id = quotes.id
          ), '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.sales_quotes quotes
  where quotes.id = p_quote_id
$$;

revoke all on function public.quote_v2_legacy_state_hash(uuid)
  from public, anon, authenticated;
grant execute on function public.quote_v2_legacy_state_hash(uuid)
  to service_role;

create or replace function public.record_quote_v2_legacy_reprice_preview(
  p_quote_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_actor_id uuid,
  p_server_catalog_date date,
  p_selection_map jsonb,
  p_legacy_total numeric,
  p_proposed_total numeric,
  p_customer_payload jsonb,
  p_results jsonb
)
returns table (
  preview_id uuid,
  preview_digest text,
  expires_at timestamptz,
  customer_payload jsonb
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_existing public.sales_quote_v2_legacy_reprice_previews%rowtype;
  v_line_count integer;
  v_selection_count integer;
  v_authoritative_count integer;
  v_normalized_selection jsonb;
  v_result_selection jsonb;
  v_customer_selection jsonb;
  v_state_hash text;
  v_batch_hash text;
  v_preview_digest text;
  v_preview_id uuid;
  v_expires_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Legacy V2 repricing previews require the service role.'
      using errcode = '42501';
  end if;
  if p_quote_id is null or p_actor_id is null
    or p_expected_revision is null or p_expected_revision < 0
  then
    raise exception 'Quote, actor, and non-negative revision are required.'
      using errcode = '22023';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
  then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.'
      using errcode = '22023';
  end if;
  if p_server_catalog_date is null
    or p_legacy_total is null or p_legacy_total < 0
    or p_proposed_total is null or p_proposed_total < 0
    or jsonb_typeof(p_customer_payload) is distinct from 'object'
    or jsonb_typeof(p_selection_map) is distinct from 'array'
    or jsonb_typeof(p_results) is distinct from 'array'
  then
    raise exception 'The legacy V2 preview payload is incomplete.'
      using errcode = '22023';
  end if;
  if public.quote_v2_customer_payload_has_protected_key(p_customer_payload) then
    raise exception 'The legacy V2 preview customer payload contains protected cost fields.'
      using errcode = '22023';
  end if;
  if not (p_customer_payload ?& array[
    'backend',
    'mode',
    'quoteId',
    'expectedRevision',
    'serverCatalogDate',
    'legacyStoredTotal',
    'proposedSelectedDesignTotal',
    'difference',
    'lineCount',
    'lines'
  ]::text[])
    or (p_customer_payload - array[
    'backend',
    'mode',
    'quoteId',
    'expectedRevision',
    'serverCatalogDate',
    'legacyStoredTotal',
    'proposedSelectedDesignTotal',
    'difference',
    'lineCount',
    'lines'
  ]::text[]) <> '{}'::jsonb
    or p_customer_payload ->> 'backend' is distinct from 'authoritative_v2'
    or p_customer_payload ->> 'mode' is distinct from 'legacy_reprice_preview_proof'
    or p_customer_payload ->> 'quoteId' is distinct from p_quote_id::text
    or (p_customer_payload ->> 'expectedRevision')::bigint is distinct from p_expected_revision
    or (p_customer_payload ->> 'serverCatalogDate')::date is distinct from p_server_catalog_date
    or round((p_customer_payload ->> 'legacyStoredTotal')::numeric, 2)
        is distinct from round(p_legacy_total, 2)
    or round((p_customer_payload ->> 'proposedSelectedDesignTotal')::numeric, 2)
        is distinct from round(p_proposed_total, 2)
    or round((p_customer_payload ->> 'difference')::numeric, 2)
        is distinct from round(p_proposed_total - p_legacy_total, 2)
    or (p_customer_payload ->> 'lineCount')::integer
        is distinct from jsonb_array_length(p_customer_payload -> 'lines')
  then
    raise exception 'The legacy V2 preview customer payload is inconsistent.'
      using errcode = '22023';
  end if;

  select quotes.*
    into v_quote
    from public.sales_quotes quotes
   where quotes.id = p_quote_id
   for update;
  if not found then
    raise exception 'Quote % does not exist.', p_quote_id using errcode = 'P0002';
  end if;
  if v_quote.quote_v2_backend or v_quote.quote_v2_status <> 'legacy'
    or v_quote.status <> 'draft'
  then
    raise exception 'Only an unsent legacy draft may be previewed for V2 repricing.'
      using errcode = '22023';
  end if;
  if v_quote.quote_v2_revision <> p_expected_revision then
    raise exception 'Legacy quote revision changed.' using errcode = '40001';
  end if;
  v_state_hash := public.quote_v2_legacy_state_hash(p_quote_id);
  if v_state_hash is null then
    raise exception 'The legacy quote state could not be fingerprinted.'
      using errcode = '22023';
  end if;

  select previews.*
    into v_existing
    from public.sales_quote_v2_legacy_reprice_previews previews
   where previews.quote_id = p_quote_id
     and previews.idempotency_key = btrim(p_idempotency_key);

  v_batch_hash := 'sha256:' || encode(
    digest(convert_to(p_results::text, 'UTF8'), 'sha256'),
    'hex'
  );
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineItemId', item ->> 'lineItemId',
      'designId', item ->> 'designId'
    ) order by item ->> 'lineItemId'
  ), '[]'::jsonb)
    into v_normalized_selection
    from jsonb_array_elements(p_selection_map) item;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineItemId', item ->> 'lineItemId',
      'designId', item ->> 'designId'
    ) order by item ->> 'lineItemId'
  ), '[]'::jsonb)
    into v_result_selection
    from jsonb_array_elements(p_results) item;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineItemId', item ->> 'lineItemId',
      'designId', item ->> 'selectedDesignId'
    ) order by item ->> 'lineItemId'
  ), '[]'::jsonb)
    into v_customer_selection
    from jsonb_array_elements(p_customer_payload -> 'lines') item;

  if v_existing.id is not null then
    if v_existing.quote_revision <> p_expected_revision
      or v_existing.created_by <> p_actor_id
      or v_existing.server_catalog_date <> p_server_catalog_date
      or v_existing.selection_map <> v_normalized_selection
      or v_existing.pricing_batch_hash <> v_batch_hash
      or v_existing.legacy_total <> round(p_legacy_total, 2)
      or v_existing.proposed_total <> round(p_proposed_total, 2)
      or v_existing.customer_payload <> p_customer_payload
    then
      raise exception 'The preview idempotency key was already used for different inputs.'
        using errcode = '40001';
    end if;
    if v_existing.expires_at <= now() then
      raise exception 'The legacy repricing preview expired.' using errcode = '40001';
    end if;
    if v_existing.legacy_state_hash is distinct from v_state_hash then
      raise exception 'The legacy quote changed after its prior preview.'
        using errcode = '40001';
    end if;
    return query select
      v_existing.id,
      v_existing.preview_digest,
      v_existing.expires_at,
      v_existing.customer_payload;
    return;
  end if;

  select count(*)::integer
    into v_line_count
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id;
  v_selection_count := jsonb_array_length(p_selection_map);
  if v_line_count < 1 or v_line_count > 40
    or v_selection_count <> v_line_count
    or jsonb_array_length(p_results) <> v_line_count
    or (p_customer_payload ->> 'lineCount')::integer <> v_line_count
  then
    raise exception 'A preview must cover every one of 1 to 40 quote lines exactly once.'
      using errcode = '22023';
  end if;
  if v_normalized_selection <> v_result_selection then
    raise exception 'The preview selection map does not match its pricing batch.'
      using errcode = '22023';
  end if;
  if v_normalized_selection <> v_customer_selection
    or exists (
      select 1
      from jsonb_array_elements(p_customer_payload -> 'lines') item
      where item ->> 'priceStatus' is distinct from 'authoritative'
        or jsonb_typeof(item #> '{price,total}') is distinct from 'number'
    )
  then
    raise exception 'The customer-safe preview does not match its authoritative selection.'
      using errcode = '22023';
  end if;
  if (
    select count(distinct item ->> 'lineItemId')
    from jsonb_array_elements(p_selection_map) item
  ) <> v_line_count then
    raise exception 'Every quote line must be selected exactly once.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_selection_map) item
    left join public.sales_quote_line_items lines
      on lines.id = (item ->> 'lineItemId')::uuid
     and lines.quote_id = p_quote_id
    left join public.sales_quote_designs designs
      on designs.id = (item ->> 'designId')::uuid
     and designs.line_item_id = lines.id
    where lines.id is null or designs.id is null
  ) then
    raise exception 'A preview selection does not belong to this quote line.'
      using errcode = '23503';
  end if;
  select count(*) filter (
    where item ->> 'priceStatus' = 'authoritative'
      and item ->> 'selectDesign' = 'true'
  )::integer
    into v_authoritative_count
    from jsonb_array_elements(p_results) item;
  if v_authoritative_count <> v_line_count then
    raise exception 'Only a fully authoritative preview may be recorded for application.'
      using errcode = '22023';
  end if;

  v_preview_digest := 'sha256:' || encode(
    digest(
      convert_to(jsonb_build_object(
        'quoteId', p_quote_id,
        'quoteRevision', p_expected_revision,
        'legacyStateHash', v_state_hash,
        'pricingBatchHash', v_batch_hash,
        'serverCatalogDate', p_server_catalog_date,
        'selectionMap', v_normalized_selection,
        'legacyTotal', round(p_legacy_total, 2),
        'proposedTotal', round(p_proposed_total, 2),
        'customerPayload', p_customer_payload
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.sales_quote_v2_legacy_reprice_previews (
    quote_id,
    quote_revision,
    preview_digest,
    legacy_state_hash,
    pricing_batch_hash,
    server_catalog_date,
    selection_map,
    line_count,
    legacy_total,
    proposed_total,
    customer_payload,
    created_by,
    idempotency_key
  ) values (
    p_quote_id,
    p_expected_revision,
    v_preview_digest,
    v_state_hash,
    v_batch_hash,
    p_server_catalog_date,
    v_normalized_selection,
    v_line_count,
    round(p_legacy_total, 2),
    round(p_proposed_total, 2),
    p_customer_payload,
    p_actor_id,
    btrim(p_idempotency_key)
  )
  returning id, sales_quote_v2_legacy_reprice_previews.expires_at
    into v_preview_id, v_expires_at;

  return query select
    v_preview_id,
    v_preview_digest,
    v_expires_at,
    p_customer_payload;
end;
$$;

revoke all on function public.record_quote_v2_legacy_reprice_preview(
  uuid, bigint, text, uuid, date, jsonb, numeric, numeric, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.record_quote_v2_legacy_reprice_preview(
  uuid, bigint, text, uuid, date, jsonb, numeric, numeric, jsonb, jsonb
) to service_role;

create or replace function public.apply_quote_v2_legacy_reprice(
  p_quote_id uuid,
  p_expected_revision bigint,
  p_preview_id uuid,
  p_preview_digest text,
  p_idempotency_key text,
  p_actor_id uuid,
  p_results jsonb
)
returns table (
  quote_id uuid,
  preview_id uuid,
  new_revision bigint,
  quote_status text,
  quote_total numeric,
  priced_design_count integer,
  blocked_design_count integer,
  customer_payload jsonb
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_preview public.sales_quote_v2_legacy_reprice_previews%rowtype;
  v_existing public.sales_quote_v2_legacy_reprice_audits%rowtype;
  v_state_hash text;
  v_batch_hash text;
  v_result_selection jsonb;
  v_saved_quote_id uuid;
  v_saved_revision bigint;
  v_saved_status text;
  v_saved_total numeric;
  v_saved_priced integer;
  v_saved_blocked integer;
  v_pricing_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Applying legacy V2 repricing requires the service role.'
      using errcode = '42501';
  end if;
  if p_quote_id is null or p_preview_id is null or p_actor_id is null
    or p_expected_revision is null or p_expected_revision < 0
    or p_preview_digest is null
    or p_preview_digest !~ '^sha256:[0-9a-f]{64}$'
    or p_idempotency_key is null or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
    or jsonb_typeof(p_results) is distinct from 'array'
  then
    raise exception 'The legacy V2 apply request is incomplete.'
      using errcode = '22023';
  end if;

  select audits.*
    into v_existing
    from public.sales_quote_v2_legacy_reprice_audits audits
   where audits.quote_id = p_quote_id
     and audits.idempotency_key = btrim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.preview_id <> p_preview_id
      or v_existing.preview_digest <> p_preview_digest
      or v_existing.previous_revision <> p_expected_revision
      or v_existing.actor_id <> p_actor_id
      or jsonb_typeof(v_existing.customer_payload) is distinct from 'object'
      or public.quote_v2_customer_payload_has_protected_key(v_existing.customer_payload)
    then
      raise exception 'The apply idempotency key was already used for different inputs.'
        using errcode = '40001';
    end if;
    return query select
      v_existing.quote_id,
      v_existing.preview_id,
      v_existing.new_revision,
      v_existing.quote_status,
      v_existing.quote_total,
      v_existing.priced_design_count,
      v_existing.blocked_design_count,
      v_existing.customer_payload;
    return;
  end if;

  select quotes.*
    into v_quote
    from public.sales_quotes quotes
   where quotes.id = p_quote_id
   for update;
  if not found then
    raise exception 'Quote % does not exist.', p_quote_id using errcode = 'P0002';
  end if;

  select previews.*
    into v_preview
    from public.sales_quote_v2_legacy_reprice_previews previews
   where previews.id = p_preview_id
     and previews.quote_id = p_quote_id
   for share;
  if not found
    or v_preview.preview_digest <> p_preview_digest
    or v_preview.quote_revision <> p_expected_revision
    or v_preview.created_by <> p_actor_id
  then
    raise exception 'The required legacy repricing preview does not match this apply request.'
      using errcode = '22023';
  end if;
  if v_preview.expires_at <= now() then
    raise exception 'The legacy repricing preview expired.' using errcode = '40001';
  end if;
  if jsonb_typeof(v_preview.customer_payload) is distinct from 'object'
    or public.quote_v2_customer_payload_has_protected_key(v_preview.customer_payload)
    or v_preview.customer_payload ->> 'quoteId' is distinct from p_quote_id::text
    or (v_preview.customer_payload ->> 'expectedRevision')::bigint
        is distinct from p_expected_revision
    or round((v_preview.customer_payload ->> 'proposedSelectedDesignTotal')::numeric, 2)
        is distinct from v_preview.proposed_total
    or (v_preview.customer_payload ->> 'lineCount')::integer
        is distinct from v_preview.line_count
  then
    raise exception 'The saved legacy repricing customer payload is invalid.'
      using errcode = '22023';
  end if;
  if v_quote.quote_v2_backend or v_quote.quote_v2_status <> 'legacy'
    or v_quote.status <> 'draft'
  then
    raise exception 'Only an unsent legacy draft may be converted to V2.'
      using errcode = '22023';
  end if;
  if v_quote.quote_v2_revision <> p_expected_revision then
    raise exception 'Legacy quote revision changed.' using errcode = '40001';
  end if;

  v_state_hash := public.quote_v2_legacy_state_hash(p_quote_id);
  if v_state_hash is distinct from v_preview.legacy_state_hash then
    raise exception 'The legacy quote changed after preview.' using errcode = '40001';
  end if;
  v_batch_hash := 'sha256:' || encode(
    digest(convert_to(p_results::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_batch_hash is distinct from v_preview.pricing_batch_hash then
    raise exception 'The authoritative pricing batch changed after preview.'
      using errcode = '40001';
  end if;
  if jsonb_array_length(p_results) <> v_preview.line_count then
    raise exception 'The apply batch no longer covers every previewed line.'
      using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineItemId', item ->> 'lineItemId',
      'designId', item ->> 'designId'
    ) order by item ->> 'lineItemId'
  ), '[]'::jsonb)
    into v_result_selection
    from jsonb_array_elements(p_results) item;
  if v_result_selection <> v_preview.selection_map then
    raise exception 'The selected designs changed after preview.' using errcode = '40001';
  end if;

  -- This transition and the existing quote-wide batch RPC share one database
  -- transaction. Any pricing/snapshot/audit failure rolls the quote back to
  -- untouched legacy state.
  update public.sales_quotes
     set quote_v2_backend = true,
         quote_v2_status = 'draft'
   where id = p_quote_id;

  select saved.quote_id,
         saved.new_revision,
         saved.quote_status,
         saved.quote_total,
         saved.priced_design_count,
         saved.blocked_design_count
    into v_saved_quote_id,
         v_saved_revision,
         v_saved_status,
         v_saved_total,
         v_saved_priced,
         v_saved_blocked
    from public.save_quote_v2_pricing_batch(
      p_quote_id,
      p_expected_revision,
      btrim(p_idempotency_key),
      p_actor_id,
      p_results
    ) saved;

  if v_saved_quote_id is null or v_saved_status <> 'priced'
    or v_saved_priced <> v_preview.line_count or v_saved_blocked <> 0
    or round(v_saved_total, 2) is distinct from v_preview.proposed_total
  then
    raise exception 'Legacy conversion did not produce a fully priced V2 quote.'
      using errcode = '22023';
  end if;
  select events.id
    into v_pricing_event_id
    from public.sales_quote_v2_events events
   where events.quote_id = p_quote_id
     and events.idempotency_key = btrim(p_idempotency_key)
     and events.event_type = 'pricing_batch';
  if v_pricing_event_id is null then
    raise exception 'The immutable V2 pricing event was not recorded.'
      using errcode = '55000';
  end if;

  insert into public.sales_quote_v2_legacy_reprice_audits (
    quote_id,
    preview_id,
    pricing_event_id,
    previous_revision,
    new_revision,
    preview_digest,
    legacy_state_hash,
    pricing_batch_hash,
    quote_status,
    quote_total,
    priced_design_count,
    blocked_design_count,
    customer_payload,
    actor_id,
    idempotency_key
  ) values (
    p_quote_id,
    p_preview_id,
    v_pricing_event_id,
    p_expected_revision,
    v_saved_revision,
    p_preview_digest,
    v_preview.legacy_state_hash,
    v_preview.pricing_batch_hash,
    v_saved_status,
    round(v_saved_total, 2),
    v_saved_priced,
    v_saved_blocked,
    v_preview.customer_payload,
    p_actor_id,
    btrim(p_idempotency_key)
  );

  return query select
    v_saved_quote_id,
    p_preview_id,
    v_saved_revision,
    v_saved_status,
    round(v_saved_total, 2),
    v_saved_priced,
    v_saved_blocked,
    v_preview.customer_payload;
end;
$$;

revoke all on function public.apply_quote_v2_legacy_reprice(
  uuid, bigint, uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_quote_v2_legacy_reprice(
  uuid, bigint, uuid, text, text, uuid, jsonb
) to service_role;

comment on table public.sales_quote_v2_legacy_reprice_previews is
  'Append-only, expiring proof that an unsent legacy draft was explicitly previewed against one exact V2 pricing batch without changing the quote.';
comment on table public.sales_quote_v2_legacy_reprice_audits is
  'Append-only link from an explicit legacy V2 preview to the immutable pricing event and price snapshots created by atomic application.';
comment on function public.apply_quote_v2_legacy_reprice(
  uuid, bigint, uuid, text, text, uuid, jsonb
) is
  'Atomically converts only an unchanged, explicitly previewed unsent legacy draft and persists selected-design-only V2 snapshots and audit evidence.';
