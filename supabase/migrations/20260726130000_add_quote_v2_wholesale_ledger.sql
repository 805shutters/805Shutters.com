-- Durable, internal-only wholesale-cost ledger for Quote V2.
--
-- This migration creates the fast lookup foundation. It does not publish any
-- manufacturer costs and does not change an existing quote. Evidence and
-- price rows are loaded into review versions by a separate source-controlled
-- seed migration. Only a reviewed, published wholesale version can be returned
-- to the authoritative quote-pricing service.

create table if not exists public.sales_quote_v2_wholesale_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  manufacturer_code text not null,
  source_type text not null,
  file_name text not null,
  title text not null,
  revision text not null,
  effective_from date,
  effective_until date,
  received_on date not null,
  sha256 text not null,
  authorities text[] not null default '{}'::text[],
  runtime_authority boolean not null default false,
  account_key text,
  account_scope text,
  product_keys text[] not null default '{}'::text[],
  program_keys text[] not null default '{}'::text[],
  product_scope jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  quarantine_reason text,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_wholesale_sources_key_check
    check (source_key ~ '^[a-z0-9][a-z0-9._:-]*$'),
  constraint sales_quote_v2_wholesale_sources_manufacturer_check
    check (manufacturer_code ~ '^[a-z0-9][a-z0-9_-]*$'),
  constraint sales_quote_v2_wholesale_sources_account_check
    check (account_key is null or account_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  constraint sales_quote_v2_wholesale_sources_type_check
    check (source_type in (
      'price_book',
      'pricing_evidence',
      'dealer_portal_snapshot',
      'product_guide',
      'program_binder',
      'restriction_workbook',
      'color_workbook'
    )),
  constraint sales_quote_v2_wholesale_sources_hash_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint sales_quote_v2_wholesale_sources_dates_check
    check (effective_until is null or effective_from is null or effective_until >= effective_from),
  constraint sales_quote_v2_wholesale_sources_json_check
    check (
      jsonb_typeof(product_scope) = 'object'
      and jsonb_typeof(provenance) = 'object'
    ),
  constraint sales_quote_v2_wholesale_sources_quarantine_check
    check (runtime_authority or quarantine_reason is not null)
);

create index if not exists sales_quote_v2_wholesale_sources_manufacturer_idx
  on public.sales_quote_v2_wholesale_sources (manufacturer_code, received_on desc);
create index if not exists sales_quote_v2_wholesale_sources_hash_idx
  on public.sales_quote_v2_wholesale_sources (sha256);
create index if not exists sales_quote_v2_wholesale_sources_authorities_idx
  on public.sales_quote_v2_wholesale_sources using gin (authorities);
create index if not exists sales_quote_v2_wholesale_sources_product_scope_idx
  on public.sales_quote_v2_wholesale_sources using gin (product_scope);
create index if not exists sales_quote_v2_wholesale_sources_product_keys_idx
  on public.sales_quote_v2_wholesale_sources using gin (product_keys);
create index if not exists sales_quote_v2_wholesale_sources_program_keys_idx
  on public.sales_quote_v2_wholesale_sources using gin (program_keys);

create table if not exists public.sales_quote_v2_wholesale_versions (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null
    references public.sales_quote_v2_manufacturers(id) on delete restrict,
  version_key text not null,
  scope_key text not null,
  lifecycle text not null default 'draft',
  effective_from date,
  effective_until date,
  account_key text not null,
  account_scope text not null,
  coverage jsonb not null default '{}'::jsonb,
  content_sha256 text not null,
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_quote_v2_wholesale_versions_identity_uniq
    unique (manufacturer_id, account_key, scope_key, version_key),
  constraint sales_quote_v2_wholesale_versions_key_check
    check (
      version_key ~ '^[a-z0-9][a-z0-9._:-]*$'
      and scope_key ~ '^[a-z0-9][a-z0-9_-]*$'
      and account_key ~ '^[a-z0-9][a-z0-9_-]*$'
    ),
  constraint sales_quote_v2_wholesale_versions_lifecycle_check
    check (lifecycle in (
      'draft',
      'review',
      'published',
      'quarantined',
      'retired'
    )),
  constraint sales_quote_v2_wholesale_versions_hash_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint sales_quote_v2_wholesale_versions_coverage_check
    check (jsonb_typeof(coverage) = 'object'),
  constraint sales_quote_v2_wholesale_versions_dates_check
    check (effective_until is null or effective_from is null or effective_until >= effective_from),
  constraint sales_quote_v2_wholesale_versions_publish_state_check
    check (
      (lifecycle = 'published'
        and effective_from is not null
        and reviewed_by is not null
        and reviewed_at is not null
        and published_by is not null
        and published_at is not null
        and retired_at is null)
      or
      (lifecycle = 'retired'
        and effective_from is not null
        and reviewed_by is not null
        and reviewed_at is not null
        and published_by is not null
        and published_at is not null
        and retired_at is not null)
      or
      (lifecycle not in ('published', 'retired')
        and published_at is null
        and published_by is null
        and retired_at is null)
    )
);

create index if not exists sales_quote_v2_wholesale_versions_lookup_idx
  on public.sales_quote_v2_wholesale_versions (
    manufacturer_id,
    account_key,
    scope_key,
    lifecycle,
    effective_from desc,
    effective_until
  );
create index if not exists sales_quote_v2_wholesale_versions_coverage_idx
  on public.sales_quote_v2_wholesale_versions using gin (coverage);
create unique index if not exists sales_quote_v2_wholesale_versions_one_effective_idx
  on public.sales_quote_v2_wholesale_versions (
    manufacturer_id,
    account_key,
    scope_key,
    effective_from
  )
  where lifecycle = 'published';

create table if not exists public.sales_quote_v2_wholesale_version_sources (
  wholesale_version_id uuid not null
    references public.sales_quote_v2_wholesale_versions(id) on delete restrict,
  source_id uuid not null
    references public.sales_quote_v2_wholesale_sources(id) on delete restrict,
  authority_scope text[] not null default '{}'::text[],
  source_priority integer not null default 100,
  created_at timestamptz not null default now(),
  primary key (wholesale_version_id, source_id),
  constraint sales_quote_v2_wholesale_version_sources_priority_check
    check (source_priority between 0 and 10000)
);

create index if not exists sales_quote_v2_wholesale_version_sources_authority_idx
  on public.sales_quote_v2_wholesale_version_sources using gin (authority_scope);

create table if not exists public.sales_quote_v2_wholesale_programs (
  id uuid primary key default gen_random_uuid(),
  wholesale_version_id uuid not null
    references public.sales_quote_v2_wholesale_versions(id) on delete restrict,
  manufacturer_code text not null,
  product_key text not null,
  program_key text not null,
  style_key text not null default '',
  color_key text not null default '',
  display_name text not null,
  cost_status text not null,
  price_axis text not null default 'width_height',
  order_cost_policy text not null default 'unresolved',
  min_width numeric(10, 4),
  max_width numeric(10, 4),
  min_height numeric(10, 4),
  max_height numeric(10, 4),
  max_area_sqft numeric(12, 4),
  configuration jsonb not null default '{}'::jsonb,
  option_schema jsonb not null default '{}'::jsonb,
  source_id uuid not null
    references public.sales_quote_v2_wholesale_sources(id) on delete restrict,
  source_locator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_wholesale_programs_identity_uniq
    unique (
      wholesale_version_id,
      product_key,
      program_key,
      style_key,
      color_key
    ),
  constraint sales_quote_v2_wholesale_programs_key_check
    check (
      manufacturer_code ~ '^[a-z0-9][a-z0-9_-]*$'
      and product_key ~ '^[a-z0-9][a-z0-9_-]*$'
      and program_key ~ '^[a-z0-9][a-z0-9_-]*$'
      and (style_key = '' or style_key ~ '^[a-z0-9][a-z0-9_-]*$')
      and (color_key = '' or color_key ~ '^[a-z0-9][a-z0-9_-]*$')
    ),
  constraint sales_quote_v2_wholesale_programs_status_check
    check (cost_status in (
      'quote_ready',
      'documented_not_published',
      'account_scope_unverified',
      'evidence_conflict',
      'manual_quote_required',
      'unavailable'
    )),
  constraint sales_quote_v2_wholesale_programs_axis_check
    check (price_axis in ('width_height', 'square_foot', 'fixed', 'manual')),
  constraint sales_quote_v2_wholesale_programs_order_cost_policy_check
    check (order_cost_policy in (
      'included',
      'rules',
      'manual_quote_required',
      'unresolved'
    )),
  constraint sales_quote_v2_wholesale_programs_option_schema_check
    check (
      jsonb_typeof(configuration) = 'object'
      and jsonb_typeof(option_schema) = 'object'
      and jsonb_typeof(source_locator) = 'object'
    ),
  constraint sales_quote_v2_wholesale_programs_dimensions_check
    check (
      (min_width is null or min_width >= 0)
      and (max_width is null or max_width >= 0)
      and (min_height is null or min_height >= 0)
      and (max_height is null or max_height >= 0)
      and (max_area_sqft is null or max_area_sqft >= 0)
      and (min_width is null or max_width is null or max_width >= min_width)
      and (min_height is null or max_height is null or max_height >= min_height)
    )
);

create index if not exists sales_quote_v2_wholesale_programs_lookup_idx
  on public.sales_quote_v2_wholesale_programs (
    wholesale_version_id,
    manufacturer_code,
    product_key,
    program_key,
    style_key,
    color_key,
    cost_status
  );
create index if not exists sales_quote_v2_wholesale_programs_configuration_idx
  on public.sales_quote_v2_wholesale_programs using gin (configuration);

create table if not exists public.sales_quote_v2_wholesale_price_cells (
  id bigint generated by default as identity primary key,
  program_id uuid not null
    references public.sales_quote_v2_wholesale_programs(id) on delete restrict,
  width_ceiling numeric(10, 4) not null,
  height_ceiling numeric(10, 4) not null,
  availability text not null default 'priced',
  cost_cents bigint,
  currency text not null default 'USD',
  sku_codes text[] not null default '{}'::text[],
  source_id uuid not null
    references public.sales_quote_v2_wholesale_sources(id) on delete restrict,
  source_locator jsonb not null default '{}'::jsonb,
  cell_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_wholesale_price_cells_identity_uniq
    unique (program_id, width_ceiling, height_ceiling),
  constraint sales_quote_v2_wholesale_price_cells_dimensions_check
    check (width_ceiling >= 0 and height_ceiling >= 0),
  constraint sales_quote_v2_wholesale_price_cells_availability_check
    check (availability in ('priced', 'unavailable', 'manual_quote_required')),
  constraint sales_quote_v2_wholesale_price_cells_cost_check
    check (
      (availability = 'priced' and cost_cents is not null and cost_cents >= 0)
      or
      (availability <> 'priced' and cost_cents is null)
    ),
  constraint sales_quote_v2_wholesale_price_cells_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint sales_quote_v2_wholesale_price_cells_fingerprint_check
    check (cell_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint sales_quote_v2_wholesale_price_cells_source_locator_check
    check (jsonb_typeof(source_locator) = 'object')
);

create index if not exists sales_quote_v2_wholesale_price_cells_grid_idx
  on public.sales_quote_v2_wholesale_price_cells (
    program_id,
    width_ceiling,
    height_ceiling
  )
  include (availability, cost_cents, currency, source_id);
create index if not exists sales_quote_v2_wholesale_price_cells_height_idx
  on public.sales_quote_v2_wholesale_price_cells (
    program_id,
    height_ceiling,
    width_ceiling
  )
  include (availability, cost_cents, currency, source_id);

create table if not exists public.sales_quote_v2_wholesale_option_components (
  id uuid primary key default gen_random_uuid(),
  wholesale_version_id uuid not null
    references public.sales_quote_v2_wholesale_versions(id) on delete restrict,
  manufacturer_code text not null,
  product_key text not null default '',
  program_key text not null default '',
  component_key text not null,
  label text not null,
  calculation text not null,
  cost_cents bigint,
  rate_basis_points integer,
  required_options jsonb not null default '{}'::jsonb,
  excluded_options jsonb not null default '{}'::jsonb,
  billing_scope text not null default 'per_unit',
  source_id uuid not null
    references public.sales_quote_v2_wholesale_sources(id) on delete restrict,
  source_locator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_wholesale_option_components_identity_uniq
    unique (
      wholesale_version_id,
      product_key,
      program_key,
      component_key,
      required_options
    ),
  constraint sales_quote_v2_wholesale_option_components_calculation_check
    check (calculation in ('fixed', 'percent_base', 'per_sqft')),
  constraint sales_quote_v2_wholesale_option_components_value_check
    check (
      (calculation in ('fixed', 'per_sqft')
        and cost_cents is not null and cost_cents >= 0
        and rate_basis_points is null)
      or
      (calculation = 'percent_base'
        and cost_cents is null
        and rate_basis_points is not null and rate_basis_points >= 0)
    ),
  constraint sales_quote_v2_wholesale_option_components_scope_check
    check (billing_scope in ('per_unit', 'per_line_once', 'per_order_once')),
  constraint sales_quote_v2_wholesale_option_components_options_check
    check (
      jsonb_typeof(required_options) = 'object'
      and jsonb_typeof(excluded_options) = 'object'
      and jsonb_typeof(source_locator) = 'object'
    )
);

create index if not exists sales_quote_v2_wholesale_option_components_lookup_idx
  on public.sales_quote_v2_wholesale_option_components (
    wholesale_version_id,
    manufacturer_code,
    product_key,
    program_key,
    component_key
  );
create index if not exists sales_quote_v2_wholesale_option_components_required_idx
  on public.sales_quote_v2_wholesale_option_components using gin (required_options);

create table if not exists public.sales_quote_v2_wholesale_order_cost_rules (
  id uuid primary key default gen_random_uuid(),
  wholesale_version_id uuid not null
    references public.sales_quote_v2_wholesale_versions(id) on delete restrict,
  manufacturer_code text not null,
  product_key text not null default '',
  program_key text not null default '',
  rule_key text not null,
  label text not null,
  rule_kind text not null,
  calculation text not null,
  first_unit_cost_cents bigint,
  additional_unit_cost_cents bigint,
  flat_cost_cents bigint,
  rate_basis_points integer,
  threshold_cents bigint,
  threshold_operator text,
  required_options jsonb not null default '{}'::jsonb,
  rule_status text not null default 'documented',
  source_id uuid not null
    references public.sales_quote_v2_wholesale_sources(id) on delete restrict,
  source_locator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_wholesale_order_cost_rules_identity_uniq
    unique (wholesale_version_id, product_key, program_key, rule_key),
  constraint sales_quote_v2_wholesale_order_cost_rules_kind_check
    check (rule_kind in ('freight', 'oversize', 'processing', 'other')),
  constraint sales_quote_v2_wholesale_order_cost_rules_calculation_check
    check (calculation in (
      'first_plus_additional',
      'flat',
      'percent_subtotal',
      'free_above_threshold',
      'unresolved'
    )),
  constraint sales_quote_v2_wholesale_order_cost_rules_status_check
    check (rule_status in ('authoritative', 'documented', 'unresolved', 'quarantined')),
  constraint sales_quote_v2_wholesale_order_cost_rules_values_check
    check (
      (
        calculation = 'first_plus_additional'
        and first_unit_cost_cents is not null
        and additional_unit_cost_cents is not null
        and flat_cost_cents is null
        and rate_basis_points is null
        and threshold_cents is null
        and threshold_operator is null
      )
      or (
        calculation = 'flat'
        and first_unit_cost_cents is null
        and additional_unit_cost_cents is null
        and flat_cost_cents is not null
        and rate_basis_points is null
        and (
          (threshold_cents is null and threshold_operator is null)
          or
          (threshold_cents is not null
            and threshold_operator in ('subtotal_lt', 'subtotal_gte'))
        )
      )
      or (
        calculation = 'percent_subtotal'
        and first_unit_cost_cents is null
        and additional_unit_cost_cents is null
        and flat_cost_cents is null
        and rate_basis_points is not null
        and threshold_cents is null
        and threshold_operator is null
      )
      or (
        calculation = 'free_above_threshold'
        and first_unit_cost_cents is null
        and additional_unit_cost_cents is null
        and coalesce(flat_cost_cents, 0) = 0
        and rate_basis_points is null
        and threshold_cents is not null
        and threshold_operator = 'subtotal_gte'
      )
      or (
        calculation = 'unresolved'
        and first_unit_cost_cents is null
        and additional_unit_cost_cents is null
        and flat_cost_cents is null
        and rate_basis_points is null
        and (
          (threshold_cents is null and threshold_operator is null)
          or
          (threshold_cents is not null
            and threshold_operator in ('subtotal_lt', 'subtotal_gte'))
        )
      )
    ),
  constraint sales_quote_v2_wholesale_order_cost_rules_nonnegative_check
    check (
      coalesce(first_unit_cost_cents, 0) >= 0
      and coalesce(additional_unit_cost_cents, 0) >= 0
      and coalesce(flat_cost_cents, 0) >= 0
      and coalesce(rate_basis_points, 0) >= 0
      and coalesce(threshold_cents, 0) >= 0
    ),
  constraint sales_quote_v2_wholesale_order_cost_rules_threshold_check
    check (
      threshold_operator is null
      or threshold_operator in ('subtotal_lt', 'subtotal_gte')
    ),
  constraint sales_quote_v2_wholesale_order_cost_rules_status_shape_check
    check (
      (calculation = 'unresolved'
        and rule_status in ('unresolved', 'quarantined'))
      or
      (calculation <> 'unresolved' and rule_status <> 'unresolved')
    ),
  constraint sales_quote_v2_wholesale_order_cost_rules_options_check
    check (
      jsonb_typeof(required_options) = 'object'
      and jsonb_typeof(source_locator) = 'object'
    )
);

create index if not exists sales_quote_v2_wholesale_order_cost_rules_lookup_idx
  on public.sales_quote_v2_wholesale_order_cost_rules (
    wholesale_version_id,
    manufacturer_code,
    product_key,
    program_key,
    rule_kind,
    rule_status
  );
create index if not exists sales_quote_v2_wholesale_order_cost_rules_options_idx
  on public.sales_quote_v2_wholesale_order_cost_rules using gin (required_options);

alter table public.sales_quote_v2_price_snapshots
  add column if not exists wholesale_version_id uuid
    references public.sales_quote_v2_wholesale_versions(id) on delete restrict,
  add column if not exists wholesale_lookup_fingerprint text;

alter table public.sales_quote_v2_price_snapshots
  drop constraint if exists sales_quote_v2_price_snapshots_wholesale_fingerprint_check;
alter table public.sales_quote_v2_price_snapshots
  add constraint sales_quote_v2_price_snapshots_wholesale_fingerprint_check
  check (
    (wholesale_version_id is null and wholesale_lookup_fingerprint is null)
    or
    (wholesale_version_id is not null
      and wholesale_lookup_fingerprint ~ '^[0-9a-f]{64}$')
  );

create index if not exists sales_quote_v2_snapshots_wholesale_version_idx
  on public.sales_quote_v2_price_snapshots (
    wholesale_version_id,
    wholesale_lookup_fingerprint
  )
  where wholesale_version_id is not null;

create or replace function public.reject_published_wholesale_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version_id uuid;
  v_old_version_id uuid;
  v_source_id uuid;
  v_old_source_id uuid;
  v_lifecycle text;
begin
  if tg_table_name = 'sales_quote_v2_wholesale_versions' then
    perform pg_advisory_xact_lock(
      hashtextextended(old.manufacturer_id::text || ':' || old.account_key, 0)
    );
    if old.lifecycle = 'retired' then
      raise exception 'Retired wholesale versions are immutable.'
        using errcode = '55000';
    end if;
    if old.lifecycle = 'published' then
      if tg_op = 'UPDATE'
        and new.lifecycle = 'retired'
        and new.retired_at is not null
        and new.effective_until is not null
        and new.effective_until >= old.effective_from
        and (to_jsonb(new) - array[
          'lifecycle',
          'effective_until',
          'retired_at',
          'updated_at'
        ]) = (to_jsonb(old) - array[
          'lifecycle',
          'effective_until',
          'retired_at',
          'updated_at'
        ])
      then
        return new;
      end if;
      raise exception 'Published wholesale versions are immutable.'
        using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'sales_quote_v2_wholesale_sources' then
    perform pg_advisory_xact_lock(
      hashtextextended('wholesale-source:' || old.id::text, 0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(
        linked_versions.manufacturer_id::text || ':' ||
          linked_versions.account_key,
        0
      )
    )
      from (
        select distinct versions.manufacturer_id, versions.account_key
          from public.sales_quote_v2_wholesale_version_sources links
          join public.sales_quote_v2_wholesale_versions versions
            on versions.id = links.wholesale_version_id
         where links.source_id = old.id
         order by versions.manufacturer_id, versions.account_key
      ) linked_versions;
    if exists (
      select 1
        from public.sales_quote_v2_wholesale_version_sources links
        join public.sales_quote_v2_wholesale_versions versions
          on versions.id = links.wholesale_version_id
       where links.source_id = old.id
         and versions.lifecycle in ('published', 'retired')
    ) then
      raise exception 'Sources used by published wholesale versions are immutable.'
        using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'sales_quote_v2_wholesale_price_cells' then
    select programs.wholesale_version_id
      into v_version_id
      from public.sales_quote_v2_wholesale_programs programs
     where programs.id = case
       when tg_op = 'DELETE' then old.program_id
       else new.program_id
     end;
    if tg_op = 'UPDATE' then
      select programs.wholesale_version_id
        into v_old_version_id
        from public.sales_quote_v2_wholesale_programs programs
       where programs.id = old.program_id;
    end if;
  elsif tg_table_name in (
    'sales_quote_v2_wholesale_version_sources',
    'sales_quote_v2_wholesale_programs',
    'sales_quote_v2_wholesale_option_components',
    'sales_quote_v2_wholesale_order_cost_rules'
  ) then
    v_version_id := case
      when tg_op = 'DELETE' then old.wholesale_version_id
      else new.wholesale_version_id
    end;
    if tg_op = 'UPDATE' then
      v_old_version_id := old.wholesale_version_id;
    end if;
    if tg_table_name = 'sales_quote_v2_wholesale_version_sources' then
      v_source_id := case
        when tg_op = 'DELETE' then old.source_id
        else new.source_id
      end;
      if tg_op = 'UPDATE' then
        v_old_source_id := old.source_id;
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wholesale-source:' || source_ids.source_id::text, 0)
  )
    from (
      select distinct candidate.source_id
        from (values (v_source_id), (v_old_source_id))
          as candidate(source_id)
       where candidate.source_id is not null
       order by candidate.source_id
    ) source_ids;

  perform pg_advisory_xact_lock(
    hashtextextended(
      affected_versions.manufacturer_id::text || ':' ||
        affected_versions.account_key,
      0
    )
  )
    from (
      select distinct versions.manufacturer_id, versions.account_key
        from public.sales_quote_v2_wholesale_versions versions
       where versions.id = v_version_id
          or versions.id = v_old_version_id
       order by versions.manufacturer_id, versions.account_key
    ) affected_versions;

  select versions.lifecycle
    into v_lifecycle
    from public.sales_quote_v2_wholesale_versions versions
   where versions.id = v_version_id;
  if v_lifecycle in ('published', 'retired') then
    raise exception 'Published wholesale ledger content is immutable.'
      using errcode = '55000';
  end if;
  if v_old_version_id is not null then
    select versions.lifecycle
      into v_lifecycle
      from public.sales_quote_v2_wholesale_versions versions
     where versions.id = v_old_version_id;
    if v_lifecycle in ('published', 'retired') then
      raise exception 'Published wholesale ledger content is immutable.'
        using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.is_quote_v2_wholesale_source_authoritative(
  p_wholesale_version_id uuid,
  p_source_id uuid,
  p_manufacturer_code text,
  p_product_key text,
  p_program_key text,
  p_required_authorities text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.sales_quote_v2_wholesale_versions versions
      join public.sales_quote_v2_manufacturers manufacturers
        on manufacturers.id = versions.manufacturer_id
      join public.sales_quote_v2_wholesale_version_sources links
        on links.wholesale_version_id = versions.id
       and links.source_id = p_source_id
      join public.sales_quote_v2_wholesale_sources sources
        on sources.id = links.source_id
     where versions.id = p_wholesale_version_id
       and sources.runtime_authority
       and sources.quarantine_reason is null
       and sources.manufacturer_code = lower(btrim(p_manufacturer_code))
       and manufacturers.code = lower(btrim(p_manufacturer_code))
       and (sources.account_key is null
         or sources.account_key = versions.account_key)
       and sources.effective_from is not null
       and sources.effective_from <= versions.effective_from
       and (sources.effective_until is null
         or sources.effective_until >= versions.effective_from)
       and (
         (versions.effective_until is null
           and sources.effective_until is null)
         or
         (versions.effective_until is not null
           and (sources.effective_until is null
             or sources.effective_until >= versions.effective_until))
       )
       and (cardinality(sources.product_keys) = 0
         or lower(btrim(p_product_key)) = any(sources.product_keys))
       and (cardinality(sources.program_keys) = 0
         or lower(btrim(p_program_key)) = any(sources.program_keys))
       and sources.authorities @> p_required_authorities
       and links.authority_scope @> p_required_authorities
  );
$$;

create or replace function public.enforce_wholesale_version_publication()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_source_count integer;
  v_runtime_source_count integer;
  v_quote_ready_program_count integer;
  v_empty_program_count integer;
  v_untrusted_program_count integer;
  v_untrusted_cell_count integer;
  v_untrusted_component_count integer;
  v_untrusted_order_rule_count integer;
  v_invalid_program_schema_count integer;
  v_invalid_component_schema_count integer;
  v_invalid_order_rule_schema_count integer;
  v_computed_content_sha256 text;
begin
  if tg_op = 'INSERT' and new.lifecycle in ('published', 'retired') then
    raise exception 'Wholesale versions must enter review before publication.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.lifecycle = 'retired' then
    if old.lifecycle <> 'published' then
      raise exception 'Only a published wholesale version may be retired.'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if new.lifecycle <> 'published' then
    return new;
  end if;
  if old.lifecycle <> 'review' then
    raise exception 'Wholesale publication requires an explicit review-to-published transition.'
      using errcode = '23514';
  end if;
  if (to_jsonb(new) - array[
      'lifecycle',
      'published_by',
      'published_at',
      'updated_at'
    ]) <> (to_jsonb(old) - array[
      'lifecycle',
      'published_by',
      'published_at',
      'updated_at'
    ])
  then
    raise exception 'Wholesale version metadata and its content hash must be finalized before publication.'
      using errcode = '23514';
  end if;
  if new.effective_from is null
    or new.reviewed_by is null
    or new.reviewed_at is null
    or new.published_by is null
    or new.published_at is null
  then
    raise exception 'Wholesale publication requires an effective date, review, and publisher.'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.manufacturer_id::text || ':' || new.account_key,
      0
    )
  );

  select count(*)::integer,
         count(*) filter (where sources.runtime_authority)::integer
    into v_source_count, v_runtime_source_count
    from public.sales_quote_v2_wholesale_version_sources links
    join public.sales_quote_v2_wholesale_sources sources
      on sources.id = links.source_id
   where links.wholesale_version_id = new.id;
  if v_source_count < 1 or v_runtime_source_count < 1 then
    raise exception 'Wholesale publication requires at least one linked runtime-authoritative source.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
      from public.sales_quote_v2_wholesale_versions existing
     where existing.manufacturer_id = new.manufacturer_id
       and existing.account_key = new.account_key
       and existing.scope_key = new.scope_key
       and existing.lifecycle in ('published', 'retired')
       and existing.id <> new.id
       and daterange(
         existing.effective_from,
         coalesce(existing.effective_until + 1, 'infinity'::date),
         '[)'
       ) && daterange(
         new.effective_from,
         coalesce(new.effective_until + 1, 'infinity'::date),
         '[)'
       )
  ) then
    raise exception 'Published wholesale effective periods cannot overlap for one manufacturer/account/scope.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
      from public.sales_quote_v2_wholesale_programs new_programs
      join public.sales_quote_v2_wholesale_programs existing_programs
        on existing_programs.manufacturer_code =
          new_programs.manufacturer_code
       and existing_programs.product_key = new_programs.product_key
       and existing_programs.program_key = new_programs.program_key
       and existing_programs.style_key = new_programs.style_key
       and existing_programs.color_key = new_programs.color_key
      join public.sales_quote_v2_wholesale_versions existing
        on existing.id = existing_programs.wholesale_version_id
     where new_programs.wholesale_version_id = new.id
       and new_programs.cost_status = 'quote_ready'
       and existing_programs.cost_status = 'quote_ready'
       and existing.manufacturer_id = new.manufacturer_id
       and existing.account_key = new.account_key
       and existing.lifecycle in ('published', 'retired')
       and existing.id <> new.id
       and daterange(
         existing.effective_from,
         coalesce(existing.effective_until + 1, 'infinity'::date),
         '[)'
       ) && daterange(
         new.effective_from,
         coalesce(new.effective_until + 1, 'infinity'::date),
         '[)'
       )
  ) then
    raise exception 'One wholesale program cannot have overlapping published versions across scopes.'
      using errcode = '23514';
  end if;
  select count(*) filter (where programs.cost_status = 'quote_ready')::integer,
         count(*) filter (
           where programs.cost_status = 'quote_ready'
             and not exists (
               select 1
                 from public.sales_quote_v2_wholesale_price_cells cells
                where cells.program_id = programs.id
                  and cells.availability = 'priced'
             )
         )::integer,
         count(*) filter (
           where programs.cost_status = 'quote_ready'
             and not public.is_quote_v2_wholesale_source_authoritative(
               new.id,
               programs.source_id,
               programs.manufacturer_code,
               programs.product_key,
               programs.program_key,
               array['dealer_cost']::text[]
             )
         )::integer
    into
      v_quote_ready_program_count,
      v_empty_program_count,
      v_untrusted_program_count
    from public.sales_quote_v2_wholesale_programs programs
   where programs.wholesale_version_id = new.id;
  if v_quote_ready_program_count < 1
    or v_empty_program_count > 0
    or v_untrusted_program_count > 0
  then
    raise exception 'Wholesale publication requires at least one fully populated quote-ready program.'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into v_invalid_program_schema_count
    from public.sales_quote_v2_wholesale_programs programs
   where programs.wholesale_version_id = new.id
     and programs.cost_status = 'quote_ready'
     and (
       programs.price_axis <> 'width_height'
       or programs.order_cost_policy not in ('included', 'rules')
       or (
         programs.order_cost_policy = 'rules'
         and not exists (
           select 1
             from public.sales_quote_v2_wholesale_order_cost_rules rules
            where rules.wholesale_version_id = new.id
              and rules.manufacturer_code = programs.manufacturer_code
              and (rules.product_key = ''
                or rules.product_key = programs.product_key)
              and (rules.program_key = ''
                or rules.program_key = programs.program_key)
         )
       )
       or jsonb_typeof(programs.option_schema) <> 'object'
       or exists (
         select 1
           from jsonb_each(programs.option_schema) option_definition
          where jsonb_typeof(option_definition.value) <> 'object'
             or (
               option_definition.value ? 'required'
               and jsonb_typeof(option_definition.value -> 'required')
                 <> 'boolean'
             )
             or (
               option_definition.value ? 'values'
               and jsonb_typeof(option_definition.value -> 'values')
                 <> 'array'
             )
             or coalesce(
               option_definition.value ->> 'costing',
               'selection_only'
             ) not in ('included', 'component', 'selection_only')
       )
     );
  if v_invalid_program_schema_count > 0 then
    raise exception 'Quote-ready wholesale programs require a valid width/height option schema.'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into v_invalid_component_schema_count
    from public.sales_quote_v2_wholesale_option_components components
    join public.sales_quote_v2_wholesale_programs programs
      on programs.wholesale_version_id = components.wholesale_version_id
     and programs.manufacturer_code = components.manufacturer_code
     and (components.product_key = ''
       or programs.product_key = components.product_key)
     and (components.program_key = ''
       or programs.program_key = components.program_key)
   where components.wholesale_version_id = new.id
     and programs.cost_status = 'quote_ready'
     and (
       components.required_options = '{}'::jsonb
       or exists (
         select 1
           from jsonb_each(components.required_options) required(key, value)
          where not (programs.option_schema ? required.key)
             or coalesce(
               programs.option_schema #>> array[required.key, 'costing'],
               'selection_only'
             ) <> 'component'
             or (
               programs.option_schema #> array[required.key, 'values']
                 is not null
               and not (
                 programs.option_schema #> array[required.key, 'values']
                   @> jsonb_build_array(required.value)
               )
             )
       )
       or exists (
         select 1
           from jsonb_object_keys(components.excluded_options) excluded(key)
          where not (programs.option_schema ? excluded.key)
       )
     );
  if v_invalid_component_schema_count > 0 then
    raise exception 'Wholesale option components must map exactly to component-priced program options.'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into v_invalid_order_rule_schema_count
    from public.sales_quote_v2_wholesale_order_cost_rules rules
    join public.sales_quote_v2_wholesale_programs programs
      on programs.wholesale_version_id = rules.wholesale_version_id
     and programs.manufacturer_code = rules.manufacturer_code
     and (rules.product_key = '' or programs.product_key = rules.product_key)
     and (rules.program_key = '' or programs.program_key = rules.program_key)
   where rules.wholesale_version_id = new.id
     and programs.cost_status = 'quote_ready'
     and exists (
       select 1
         from jsonb_each(rules.required_options) required(key, value)
        where not (programs.option_schema ? required.key)
           or (
             programs.option_schema #> array[required.key, 'values']
               is not null
             and not (
               programs.option_schema #> array[required.key, 'values']
                 @> jsonb_build_array(required.value)
             )
           )
     );
  if v_invalid_order_rule_schema_count > 0 then
    raise exception 'Wholesale order-cost rules contain unsupported program options.'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into v_untrusted_cell_count
    from public.sales_quote_v2_wholesale_price_cells cells
    join public.sales_quote_v2_wholesale_programs programs
      on programs.id = cells.program_id
   where programs.wholesale_version_id = new.id
     and programs.cost_status = 'quote_ready'
     and not public.is_quote_v2_wholesale_source_authoritative(
       new.id,
       cells.source_id,
       programs.manufacturer_code,
       programs.product_key,
       programs.program_key,
       array['dealer_cost']::text[]
     );

  select count(*)::integer
    into v_untrusted_component_count
    from public.sales_quote_v2_wholesale_option_components components
    join public.sales_quote_v2_wholesale_programs programs
      on programs.wholesale_version_id = components.wholesale_version_id
     and programs.manufacturer_code = components.manufacturer_code
     and (components.product_key = ''
       or programs.product_key = components.product_key)
     and (components.program_key = ''
       or programs.program_key = components.program_key)
   where components.wholesale_version_id = new.id
     and programs.cost_status = 'quote_ready'
     and not public.is_quote_v2_wholesale_source_authoritative(
       new.id,
       components.source_id,
       programs.manufacturer_code,
       programs.product_key,
       programs.program_key,
       array['option_cost']::text[]
     );

  select count(*)::integer
    into v_untrusted_order_rule_count
    from public.sales_quote_v2_wholesale_order_cost_rules rules
    join public.sales_quote_v2_wholesale_programs programs
      on programs.wholesale_version_id = rules.wholesale_version_id
     and programs.manufacturer_code = rules.manufacturer_code
     and (rules.product_key = '' or programs.product_key = rules.product_key)
     and (rules.program_key = '' or programs.program_key = rules.program_key)
   where rules.wholesale_version_id = new.id
     and programs.cost_status = 'quote_ready'
     and rules.rule_status in ('authoritative', 'documented')
     and not public.is_quote_v2_wholesale_source_authoritative(
       new.id,
       rules.source_id,
       programs.manufacturer_code,
       programs.product_key,
       programs.program_key,
       array[
         case
           when rules.rule_kind = 'other' then 'other_cost'
           else rules.rule_kind
         end
       ]::text[]
     );

  if v_untrusted_cell_count > 0
    or v_untrusted_component_count > 0
    or v_untrusted_order_rule_count > 0
  then
    raise exception 'Published wholesale price content must use linked runtime-authoritative sources.'
      using errcode = '23514';
  end if;

  v_computed_content_sha256 :=
    public.compute_quote_v2_wholesale_version_content_sha256(new.id);
  if new.content_sha256 is distinct from v_computed_content_sha256 then
    raise exception 'Wholesale version content hash does not match its canonical ledger manifest.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.compute_quote_v2_wholesale_version_content_sha256(
  p_wholesale_version_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select encode(
    digest(
      convert_to(
        jsonb_build_object(
          'version',
          jsonb_build_object(
            'manufacturerCode', manufacturers.code,
            'versionKey', versions.version_key,
            'scopeKey', versions.scope_key,
            'effectiveFrom', versions.effective_from,
            'accountKey', versions.account_key,
            'accountScope', versions.account_scope,
            'coverage', versions.coverage
          ),
          'sources',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'sourceKey', sources.source_key,
                'manufacturerCode', sources.manufacturer_code,
                'sourceType', sources.source_type,
                'fileName', sources.file_name,
                'title', sources.title,
                'revision', sources.revision,
                'effectiveFrom', sources.effective_from,
                'effectiveUntil', sources.effective_until,
                'receivedOn', sources.received_on,
                'sha256', sources.sha256,
                'authorities', sources.authorities,
                'runtimeAuthority', sources.runtime_authority,
                'accountKey', sources.account_key,
                'accountScope', sources.account_scope,
                'productKeys', sources.product_keys,
                'programKeys', sources.program_keys,
                'productScope', sources.product_scope,
                'provenance', sources.provenance,
                'quarantineReason', sources.quarantine_reason,
                'authorityScope', links.authority_scope,
                'sourcePriority', links.source_priority
              )
              order by links.source_priority, sources.source_key
            )
              from public.sales_quote_v2_wholesale_version_sources links
              join public.sales_quote_v2_wholesale_sources sources
                on sources.id = links.source_id
             where links.wholesale_version_id = versions.id
          ), '[]'::jsonb),
          'programs',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'manufacturerCode', programs.manufacturer_code,
                'productKey', programs.product_key,
                'programKey', programs.program_key,
                'styleKey', programs.style_key,
                'colorKey', programs.color_key,
                'displayName', programs.display_name,
                'costStatus', programs.cost_status,
                'priceAxis', programs.price_axis,
                'orderCostPolicy', programs.order_cost_policy,
                'minWidth', programs.min_width,
                'maxWidth', programs.max_width,
                'minHeight', programs.min_height,
                'maxHeight', programs.max_height,
                'maxAreaSqft', programs.max_area_sqft,
                'configuration', programs.configuration,
                'optionSchema', programs.option_schema,
                'sourceKey', program_sources.source_key,
                'sourceLocator', programs.source_locator,
                'cells',
                coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'widthCeiling', cells.width_ceiling,
                      'heightCeiling', cells.height_ceiling,
                      'availability', cells.availability,
                      'costCents', cells.cost_cents,
                      'currency', cells.currency,
                      'skuCodes', cells.sku_codes,
                      'sourceKey', cell_sources.source_key,
                      'sourceLocator', cells.source_locator,
                      'cellFingerprint', cells.cell_fingerprint
                    )
                    order by cells.height_ceiling, cells.width_ceiling
                  )
                    from public.sales_quote_v2_wholesale_price_cells cells
                    join public.sales_quote_v2_wholesale_sources cell_sources
                      on cell_sources.id = cells.source_id
                   where cells.program_id = programs.id
                ), '[]'::jsonb)
              )
              order by
                programs.product_key,
                programs.program_key,
                programs.style_key,
                programs.color_key
            )
              from public.sales_quote_v2_wholesale_programs programs
              join public.sales_quote_v2_wholesale_sources program_sources
                on program_sources.id = programs.source_id
             where programs.wholesale_version_id = versions.id
          ), '[]'::jsonb),
          'optionComponents',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'manufacturerCode', components.manufacturer_code,
                'productKey', components.product_key,
                'programKey', components.program_key,
                'componentKey', components.component_key,
                'label', components.label,
                'calculation', components.calculation,
                'costCents', components.cost_cents,
                'rateBasisPoints', components.rate_basis_points,
                'requiredOptions', components.required_options,
                'excludedOptions', components.excluded_options,
                'billingScope', components.billing_scope,
                'sourceKey', component_sources.source_key,
                'sourceLocator', components.source_locator
              )
              order by
                components.product_key,
                components.program_key,
                components.component_key,
                components.required_options::text
            )
              from public.sales_quote_v2_wholesale_option_components components
              join public.sales_quote_v2_wholesale_sources component_sources
                on component_sources.id = components.source_id
             where components.wholesale_version_id = versions.id
          ), '[]'::jsonb),
          'orderCostRules',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'manufacturerCode', rules.manufacturer_code,
                'productKey', rules.product_key,
                'programKey', rules.program_key,
                'ruleKey', rules.rule_key,
                'label', rules.label,
                'ruleKind', rules.rule_kind,
                'calculation', rules.calculation,
                'firstUnitCostCents', rules.first_unit_cost_cents,
                'additionalUnitCostCents', rules.additional_unit_cost_cents,
                'flatCostCents', rules.flat_cost_cents,
                'rateBasisPoints', rules.rate_basis_points,
                'thresholdCents', rules.threshold_cents,
                'thresholdOperator', rules.threshold_operator,
                'requiredOptions', rules.required_options,
                'ruleStatus', rules.rule_status,
                'sourceKey', rule_sources.source_key,
                'sourceLocator', rules.source_locator
              )
              order by
                rules.product_key,
                rules.program_key,
                rules.rule_kind,
                rules.rule_key
            )
              from public.sales_quote_v2_wholesale_order_cost_rules rules
              join public.sales_quote_v2_wholesale_sources rule_sources
                on rule_sources.id = rules.source_id
             where rules.wholesale_version_id = versions.id
          ), '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
    from public.sales_quote_v2_wholesale_versions versions
    join public.sales_quote_v2_manufacturers manufacturers
      on manufacturers.id = versions.manufacturer_id
   where versions.id = p_wholesale_version_id;
$$;

drop trigger if exists sales_quote_v2_wholesale_versions_publish_insert_guard
  on public.sales_quote_v2_wholesale_versions;
create trigger sales_quote_v2_wholesale_versions_publish_insert_guard
before insert
on public.sales_quote_v2_wholesale_versions
for each row
execute function public.enforce_wholesale_version_publication();

drop trigger if exists sales_quote_v2_wholesale_versions_publish_guard
  on public.sales_quote_v2_wholesale_versions;
create trigger sales_quote_v2_wholesale_versions_publish_guard
before update of lifecycle
on public.sales_quote_v2_wholesale_versions
for each row
execute function public.enforce_wholesale_version_publication();

drop trigger if exists sales_quote_v2_wholesale_versions_immutable
  on public.sales_quote_v2_wholesale_versions;
create trigger sales_quote_v2_wholesale_versions_immutable
before update or delete
on public.sales_quote_v2_wholesale_versions
for each row
execute function public.reject_published_wholesale_ledger_mutation();

drop trigger if exists sales_quote_v2_wholesale_sources_immutable
  on public.sales_quote_v2_wholesale_sources;
create trigger sales_quote_v2_wholesale_sources_immutable
before update or delete
on public.sales_quote_v2_wholesale_sources
for each row
execute function public.reject_published_wholesale_ledger_mutation();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sales_quote_v2_wholesale_version_sources',
    'sales_quote_v2_wholesale_programs',
    'sales_quote_v2_wholesale_price_cells',
    'sales_quote_v2_wholesale_option_components',
    'sales_quote_v2_wholesale_order_cost_rules'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I',
      v_table || '_immutable', v_table);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
       for each row execute function public.reject_published_wholesale_ledger_mutation()',
      v_table || '_immutable',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.enforce_published_wholesale_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lifecycle text;
  v_account_key text;
  v_snapshot_version_text text;
  v_snapshot_fingerprint text;
  v_lookup_input jsonb;
  v_verified_lookup jsonb;
  v_quantity numeric;
  v_expected_product_total_cents bigint;
begin
  if new.wholesale_version_id is null
    and new.internal_cost_snapshot ->> 'authority' = 'wholesale_ledger'
  then
    v_snapshot_version_text :=
      new.internal_cost_snapshot ->> 'wholesaleVersionId';
    v_snapshot_fingerprint :=
      new.internal_cost_snapshot ->> 'lookupFingerprint';
    if v_snapshot_version_text is null
      or v_snapshot_version_text !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or v_snapshot_fingerprint is null
      or v_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    then
      raise exception 'A ledger-priced quote snapshot requires a valid wholesale version and fingerprint.'
        using errcode = '23514';
    end if;
    new.wholesale_version_id := v_snapshot_version_text::uuid;
    new.wholesale_lookup_fingerprint := v_snapshot_fingerprint;
  end if;
  if new.wholesale_version_id is null then
    if new.internal_cost_snapshot ->> 'authority' = 'wholesale_ledger'
      or new.internal_cost_snapshot ? 'wholesaleVersionId'
      or new.internal_cost_snapshot ? 'lookupFingerprint'
    then
      raise exception 'A ledger-priced quote snapshot requires its wholesale version and fingerprint columns.'
        using errcode = '23514';
    end if;
    return new;
  end if;
  select versions.lifecycle, versions.account_key
    into v_lifecycle, v_account_key
    from public.sales_quote_v2_wholesale_versions versions
   where versions.id = new.wholesale_version_id;
  if v_lifecycle is null then
    raise exception 'The wholesale version attached to this quote snapshot does not exist.'
      using errcode = '23514';
  end if;
  if v_lifecycle not in ('published', 'retired') then
    raise exception 'Only an effective published or retired wholesale version may be attached to an authoritative quote snapshot.'
      using errcode = '23514';
  end if;
  if new.internal_cost_snapshot ->> 'authority'
      is distinct from 'wholesale_ledger'
    or new.internal_cost_snapshot ->> 'wholesaleVersionId'
      is distinct from new.wholesale_version_id::text
    or new.internal_cost_snapshot ->> 'lookupFingerprint'
      is distinct from new.wholesale_lookup_fingerprint
  then
    raise exception 'The ledger-priced quote snapshot does not match its immutable wholesale reference.'
      using errcode = '23514';
  end if;

  v_lookup_input := new.internal_cost_snapshot -> 'wholesaleLookupInput';
  if jsonb_typeof(v_lookup_input) is distinct from 'object'
    or v_lookup_input ->> 'accountKey' is distinct from v_account_key
    or jsonb_typeof(v_lookup_input -> 'width') is distinct from 'number'
    or jsonb_typeof(v_lookup_input -> 'height') is distinct from 'number'
    or jsonb_typeof(v_lookup_input -> 'options') is distinct from 'object'
    or coalesce(btrim(v_lookup_input ->> 'manufacturerCode'), '') = ''
    or coalesce(btrim(v_lookup_input ->> 'productKey'), '') = ''
    or coalesce(btrim(v_lookup_input ->> 'programKey'), '') = ''
    or coalesce(btrim(v_lookup_input ->> 'asOf'), '') = ''
  then
    raise exception 'The ledger-priced quote snapshot requires its exact normalized lookup input.'
      using errcode = '23514';
  end if;

  begin
    v_verified_lookup := public.lookup_quote_v2_wholesale_cost(
      v_lookup_input ->> 'manufacturerCode',
      v_account_key,
      v_lookup_input ->> 'productKey',
      v_lookup_input ->> 'programKey',
      coalesce(v_lookup_input ->> 'styleKey', ''),
      coalesce(v_lookup_input ->> 'colorKey', ''),
      (v_lookup_input ->> 'width')::numeric,
      (v_lookup_input ->> 'height')::numeric,
      v_lookup_input -> 'options',
      (v_lookup_input ->> 'asOf')::date
    );
  exception when others then
    raise exception 'The ledger-priced quote snapshot lookup could not be verified.'
      using errcode = '23514';
  end;

  if v_verified_lookup ->> 'status' is distinct from 'authoritative'
    or v_verified_lookup ->> 'wholesaleVersionId'
      is distinct from new.wholesale_version_id::text
    or v_verified_lookup ->> 'wholesaleVersionKey'
      is distinct from
        new.internal_cost_snapshot ->> 'wholesaleVersionKey'
    or v_verified_lookup ->> 'lookupFingerprint'
      is distinct from new.wholesale_lookup_fingerprint
    or v_verified_lookup ->> 'baseCostCents'
      is distinct from
        new.internal_cost_snapshot ->> 'wholesaleBaseCostCents'
    or v_verified_lookup ->> 'perUnitOptionCostCents'
      is distinct from
        new.internal_cost_snapshot ->> 'wholesalePerUnitOptionCostCents'
    or v_verified_lookup ->> 'perLineOnceCostCents'
      is distinct from
        new.internal_cost_snapshot ->> 'wholesalePerLineOnceCostCents'
    or v_verified_lookup ->> 'perOrderOnceCostCents'
      is distinct from
        new.internal_cost_snapshot ->> 'wholesalePerOrderOnceCostCents'
    or v_verified_lookup ->> 'wholesaleUnitCostCents'
      is distinct from
        new.internal_cost_snapshot ->> 'wholesaleUnitCostCents'
  then
    raise exception 'The quote snapshot wholesale cost or provenance does not match the authoritative ledger lookup.'
      using errcode = '23514';
  end if;

  if jsonb_typeof(new.internal_cost_snapshot -> 'productCostUnit')
      is distinct from 'number'
    or round(
      (new.internal_cost_snapshot ->> 'productCostUnit')::numeric * 100
    )::bigint is distinct from
      (v_verified_lookup ->> 'wholesaleUnitCostCents')::bigint
  then
    raise exception 'The quote snapshot product unit cost does not match the authoritative wholesale ledger.'
      using errcode = '23514';
  end if;

  select lines.quantity::numeric
    into v_quantity
    from public.sales_quote_line_items lines
   where lines.id = new.line_item_id
     and lines.quote_id = new.quote_id;
  if v_quantity is null or v_quantity <= 0 then
    raise exception 'The quote snapshot line quantity could not be verified.'
      using errcode = '23514';
  end if;
  v_expected_product_total_cents :=
    (v_verified_lookup ->> 'wholesaleUnitCostCents')::bigint *
      v_quantity::bigint
    + (v_verified_lookup ->> 'perLineOnceCostCents')::bigint;
  if jsonb_typeof(new.internal_cost_snapshot -> 'productCostTotal')
      is distinct from 'number'
    or round(
      (new.internal_cost_snapshot ->> 'productCostTotal')::numeric * 100
    )::bigint is distinct from v_expected_product_total_cents
  then
    raise exception 'The quote snapshot product total does not reconcile to the authoritative wholesale ledger and line quantity.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_quote_v2_published_wholesale_snapshot_trigger
  on public.sales_quote_v2_price_snapshots;
create trigger sales_quote_v2_published_wholesale_snapshot_trigger
before insert or update of
  wholesale_version_id,
  wholesale_lookup_fingerprint,
  internal_cost_snapshot
on public.sales_quote_v2_price_snapshots
for each row
execute function public.enforce_published_wholesale_snapshot();

create or replace function public.lookup_quote_v2_wholesale_cost(
  p_manufacturer_code text,
  p_account_key text,
  p_product_key text,
  p_program_key text,
  p_style_key text,
  p_color_key text,
  p_width numeric,
  p_height numeric,
  p_options jsonb,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_version public.sales_quote_v2_wholesale_versions%rowtype;
  v_manufacturer_id uuid;
  v_program public.sales_quote_v2_wholesale_programs%rowtype;
  v_width_ceiling numeric;
  v_height_ceiling numeric;
  v_cell public.sales_quote_v2_wholesale_price_cells%rowtype;
  v_option_components jsonb;
  v_order_rules jsonb;
  v_sources jsonb;
  v_per_unit_option_total bigint;
  v_line_once_option_total bigint;
  v_order_once_option_total bigint;
  v_total bigint;
  v_normalized_input jsonb;
  v_fingerprint text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Wholesale cost lookup requires the trusted Quote V2 service.'
      using errcode = '42501';
  end if;
  if p_width is null or p_width <= 0 or p_height is null or p_height <= 0 then
    raise exception 'Wholesale lookup requires positive dimensions.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_options, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'Wholesale lookup options must be a JSON object.'
      using errcode = '22023';
  end if;

  select manufacturers.id
    into v_manufacturer_id
    from public.sales_quote_v2_manufacturers manufacturers
   where manufacturers.code = lower(btrim(p_manufacturer_code));
  if not found then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_MANUFACTURER_UNKNOWN'
    );
  end if;

  select versions.*
    into v_version
    from public.sales_quote_v2_wholesale_versions versions
    join public.sales_quote_v2_wholesale_programs programs
      on programs.wholesale_version_id = versions.id
   where versions.manufacturer_id = v_manufacturer_id
     and versions.account_key = lower(btrim(p_account_key))
     and versions.lifecycle in ('published', 'retired')
     and versions.effective_from <= p_as_of
     and (versions.effective_until is null or versions.effective_until >= p_as_of)
     and programs.manufacturer_code = lower(btrim(p_manufacturer_code))
     and programs.product_key = lower(btrim(p_product_key))
     and programs.program_key = lower(btrim(p_program_key))
     and programs.style_key = lower(btrim(coalesce(p_style_key, '')))
     and programs.color_key = lower(btrim(coalesce(p_color_key, '')))
   order by versions.effective_from desc, versions.published_at desc, versions.id
   limit 1;
  if not found then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_VERSION_NOT_PUBLISHED',
      'manufacturerCode', lower(btrim(p_manufacturer_code)),
      'accountKey', lower(btrim(p_account_key)),
      'asOf', p_as_of
    );
  end if;

  select programs.*
    into v_program
    from public.sales_quote_v2_wholesale_programs programs
   where programs.wholesale_version_id = v_version.id
     and programs.manufacturer_code = lower(btrim(p_manufacturer_code))
     and programs.product_key = lower(btrim(p_product_key))
     and programs.program_key = lower(btrim(p_program_key))
     and programs.style_key = lower(btrim(coalesce(p_style_key, '')))
     and programs.color_key = lower(btrim(coalesce(p_color_key, '')))
   limit 1;
  if not found or v_program.cost_status <> 'quote_ready' then
    return jsonb_build_object(
      'status', 'blocked',
      'code', case
        when not found then 'WHOLESALE_PROGRAM_NOT_FOUND'
        else 'WHOLESALE_PROGRAM_NOT_QUOTE_READY'
      end,
      'wholesaleVersionId', v_version.id,
      'wholesaleVersionKey', v_version.version_key,
      'programStatus', case when found then v_program.cost_status else null end
    );
  end if;
  if v_program.price_axis <> 'width_height' then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_PRICE_AXIS_UNSUPPORTED',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;
  if v_program.order_cost_policy not in ('included', 'rules') then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_ORDER_COST_POLICY_UNRESOLVED',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;
  if exists (
    select 1
      from jsonb_object_keys(coalesce(p_options, '{}'::jsonb)) selected(key)
     where not (v_program.option_schema ? selected.key)
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_OPTION_UNKNOWN',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;
  if exists (
    select 1
      from jsonb_each(v_program.option_schema) definitions(key, definition)
     where coalesce((definitions.definition ->> 'required')::boolean, false)
       and not (coalesce(p_options, '{}'::jsonb) ? definitions.key)
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_OPTION_REQUIRED',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;
  if exists (
    select 1
      from jsonb_each(v_program.option_schema) definitions(key, definition)
     where coalesce(p_options, '{}'::jsonb) ? definitions.key
       and definitions.definition ? 'values'
       and not (
         definitions.definition -> 'values'
           @> jsonb_build_array(coalesce(p_options, '{}'::jsonb) -> definitions.key)
       )
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_OPTION_VALUE_UNSUPPORTED',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;
  if exists (
    select 1
      from jsonb_each(v_program.option_schema) definitions(key, definition)
     where coalesce(p_options, '{}'::jsonb) ? definitions.key
       and coalesce(
         definitions.definition ->> 'costing',
         'selection_only'
       ) = 'component'
       and not exists (
         select 1
           from public.sales_quote_v2_wholesale_option_components components
          where components.wholesale_version_id = v_version.id
            and components.manufacturer_code =
              lower(btrim(p_manufacturer_code))
            and (components.product_key = ''
              or components.product_key = v_program.product_key)
            and (components.program_key = ''
              or components.program_key = v_program.program_key)
            and coalesce(p_options, '{}'::jsonb)
              @> components.required_options
            and components.required_options
              @> jsonb_build_object(
                definitions.key,
                coalesce(p_options, '{}'::jsonb) -> definitions.key
              )
            and not (
              components.excluded_options <> '{}'::jsonb
              and coalesce(p_options, '{}'::jsonb)
                @> components.excluded_options
            )
       )
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_OPTION_PRICE_MISSING',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;
  if (v_program.min_width is not null and p_width < v_program.min_width)
    or (v_program.max_width is not null and p_width > v_program.max_width)
    or (v_program.min_height is not null and p_height < v_program.min_height)
    or (v_program.max_height is not null and p_height > v_program.max_height)
    or (v_program.max_area_sqft is not null
      and (p_width * p_height / 144.0) > v_program.max_area_sqft)
  then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_DIMENSIONS_OUT_OF_RANGE',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;

  select min(cells.width_ceiling)
    into v_width_ceiling
    from public.sales_quote_v2_wholesale_price_cells cells
   where cells.program_id = v_program.id
     and cells.width_ceiling >= p_width;
  select min(cells.height_ceiling)
    into v_height_ceiling
    from public.sales_quote_v2_wholesale_price_cells cells
   where cells.program_id = v_program.id
     and cells.height_ceiling >= p_height;
  if v_width_ceiling is null or v_height_ceiling is null then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_GRID_OUT_OF_RANGE',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;

  select cells.*
    into v_cell
    from public.sales_quote_v2_wholesale_price_cells cells
   where cells.program_id = v_program.id
     and cells.width_ceiling = v_width_ceiling
     and cells.height_ceiling = v_height_ceiling;
  if not found or v_cell.availability <> 'priced' then
    return jsonb_build_object(
      'status', 'blocked',
      'code', case
        when not found then 'WHOLESALE_GRID_CELL_MISSING'
        else 'WHOLESALE_GRID_CELL_' || upper(v_cell.availability)
      end,
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id,
      'matchedWidth', v_width_ceiling,
      'matchedHeight', v_height_ceiling
    );
  end if;

  if exists (
    select 1
      from public.sales_quote_v2_wholesale_option_components components
     where components.wholesale_version_id = v_version.id
       and components.manufacturer_code = lower(btrim(p_manufacturer_code))
       and (components.product_key = ''
         or components.product_key = v_program.product_key)
       and (components.program_key = ''
         or components.program_key = v_program.program_key)
       and coalesce(p_options, '{}'::jsonb) @> components.required_options
       and not (
         components.excluded_options <> '{}'::jsonb
         and coalesce(p_options, '{}'::jsonb) @> components.excluded_options
       )
     group by components.component_key
    having count(*) > 1
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_OPTION_COMPONENT_AMBIGUOUS',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'componentKey', components.component_key,
        'label', components.label,
        'calculation', components.calculation,
        'costCents', case components.calculation
          when 'fixed' then components.cost_cents
          when 'percent_base' then round(
            v_cell.cost_cents * components.rate_basis_points / 10000.0
          )::bigint
          when 'per_sqft' then round(
            components.cost_cents * p_width * p_height / 144.0
          )::bigint
        end,
        'billingScope', components.billing_scope,
        'sourceId', components.source_id,
        'sourceLocator', components.source_locator
      )
      order by components.component_key
    ), '[]'::jsonb),
    coalesce(sum(
      case components.calculation
        when 'fixed' then components.cost_cents
        when 'percent_base' then round(
          v_cell.cost_cents * components.rate_basis_points / 10000.0
        )::bigint
        when 'per_sqft' then round(
          components.cost_cents * p_width * p_height / 144.0
        )::bigint
      end
    ) filter (where components.billing_scope = 'per_unit'), 0)::bigint,
    coalesce(sum(
      case components.calculation
        when 'fixed' then components.cost_cents
        when 'percent_base' then round(
          v_cell.cost_cents * components.rate_basis_points / 10000.0
        )::bigint
        when 'per_sqft' then round(
          components.cost_cents * p_width * p_height / 144.0
        )::bigint
      end
    ) filter (where components.billing_scope = 'per_line_once'), 0)::bigint,
    coalesce(sum(
      case components.calculation
        when 'fixed' then components.cost_cents
        when 'percent_base' then round(
          v_cell.cost_cents * components.rate_basis_points / 10000.0
        )::bigint
        when 'per_sqft' then round(
          components.cost_cents * p_width * p_height / 144.0
        )::bigint
      end
    ) filter (where components.billing_scope = 'per_order_once'), 0)::bigint
    into
      v_option_components,
      v_per_unit_option_total,
      v_line_once_option_total,
      v_order_once_option_total
    from public.sales_quote_v2_wholesale_option_components components
   where components.wholesale_version_id = v_version.id
     and components.manufacturer_code = lower(btrim(p_manufacturer_code))
     and (components.product_key = '' or components.product_key = v_program.product_key)
     and (components.program_key = '' or components.program_key = v_program.program_key)
     and coalesce(p_options, '{}'::jsonb) @> components.required_options
     and not (
       components.excluded_options <> '{}'::jsonb
       and coalesce(p_options, '{}'::jsonb) @> components.excluded_options
     );

  if exists (
    select 1
      from public.sales_quote_v2_wholesale_order_cost_rules rules
     where rules.wholesale_version_id = v_version.id
       and rules.manufacturer_code = lower(btrim(p_manufacturer_code))
       and (rules.product_key = '' or rules.product_key = v_program.product_key)
       and (rules.program_key = '' or rules.program_key = v_program.program_key)
       and coalesce(p_options, '{}'::jsonb) @> rules.required_options
     group by rules.rule_key
    having count(*) > 1
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_ORDER_COST_AMBIGUOUS',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ruleKey', rules.rule_key,
      'label', rules.label,
      'kind', rules.rule_kind,
      'calculation', rules.calculation,
      'firstUnitCostCents', rules.first_unit_cost_cents,
      'additionalUnitCostCents', rules.additional_unit_cost_cents,
      'flatCostCents', rules.flat_cost_cents,
      'rateBasisPoints', rules.rate_basis_points,
      'thresholdCents', rules.threshold_cents,
      'thresholdOperator', rules.threshold_operator,
      'status', rules.rule_status,
      'sourceId', rules.source_id,
      'sourceLocator', rules.source_locator
    )
    order by rules.rule_kind, rules.rule_key
  ), '[]'::jsonb)
    into v_order_rules
    from public.sales_quote_v2_wholesale_order_cost_rules rules
   where rules.wholesale_version_id = v_version.id
     and rules.manufacturer_code = lower(btrim(p_manufacturer_code))
     and (rules.product_key = '' or rules.product_key = v_program.product_key)
     and (rules.program_key = '' or rules.program_key = v_program.program_key)
     and coalesce(p_options, '{}'::jsonb) @> rules.required_options;

  if v_program.order_cost_policy = 'rules'
    and jsonb_array_length(v_order_rules) = 0
  then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_ORDER_COST_MISSING',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;

  if exists (
    select 1
      from public.sales_quote_v2_wholesale_order_cost_rules rules
     where rules.wholesale_version_id = v_version.id
       and rules.manufacturer_code = lower(btrim(p_manufacturer_code))
       and (rules.product_key = '' or rules.product_key = v_program.product_key)
       and (rules.program_key = '' or rules.program_key = v_program.program_key)
       and coalesce(p_options, '{}'::jsonb) @> rules.required_options
       and rules.rule_status in ('unresolved', 'quarantined')
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'WHOLESALE_ORDER_COST_UNRESOLVED',
      'wholesaleVersionId', v_version.id,
      'programId', v_program.id
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sourceKey', sources.source_key,
      'sourceType', sources.source_type,
      'fileName', sources.file_name,
      'revision', sources.revision,
      'effectiveFrom', sources.effective_from,
      'effectiveUntil', sources.effective_until,
      'receivedOn', sources.received_on,
      'sha256', sources.sha256,
      'accountScope', sources.account_scope,
      'authorityScope', links.authority_scope
    )
    order by links.source_priority, sources.source_key
  ), '[]'::jsonb)
    into v_sources
    from public.sales_quote_v2_wholesale_version_sources links
    join public.sales_quote_v2_wholesale_sources sources
      on sources.id = links.source_id
   where links.wholesale_version_id = v_version.id;

  v_total := v_cell.cost_cents + v_per_unit_option_total;
  v_normalized_input := jsonb_build_object(
    'manufacturerCode', lower(btrim(p_manufacturer_code)),
    'accountKey', lower(btrim(p_account_key)),
    'productKey', lower(btrim(p_product_key)),
    'programKey', lower(btrim(p_program_key)),
    'styleKey', lower(btrim(coalesce(p_style_key, ''))),
    'colorKey', lower(btrim(coalesce(p_color_key, ''))),
    'width', p_width,
    'height', p_height,
    'options', coalesce(p_options, '{}'::jsonb),
    'asOf', p_as_of
  );
  v_fingerprint := encode(digest(convert_to(
    jsonb_build_object(
      'versionId', v_version.id,
      'versionHash', v_version.content_sha256,
      'input', v_normalized_input,
      'cellFingerprint', v_cell.cell_fingerprint,
      'optionComponents', v_option_components,
      'orderCostRules', v_order_rules
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  return jsonb_build_object(
    'status', 'authoritative',
    'wholesaleVersionId', v_version.id,
    'wholesaleVersionKey', v_version.version_key,
    'scopeKey', v_version.scope_key,
    'effectiveFrom', v_version.effective_from,
    'effectiveUntil', v_version.effective_until,
    'accountKey', v_version.account_key,
    'accountScope', v_version.account_scope,
    'programId', v_program.id,
    'manufacturerCode', v_program.manufacturer_code,
    'productKey', v_program.product_key,
    'programKey', v_program.program_key,
    'styleKey', v_program.style_key,
    'colorKey', v_program.color_key,
    'requestedWidth', p_width,
    'requestedHeight', p_height,
    'matchedWidth', v_width_ceiling,
    'matchedHeight', v_height_ceiling,
    'baseCostCents', v_cell.cost_cents,
    'optionCostCents', v_per_unit_option_total,
    'perUnitOptionCostCents', v_per_unit_option_total,
    'perLineOnceCostCents', v_line_once_option_total,
    'perOrderOnceCostCents', v_order_once_option_total,
    'wholesaleUnitCostCents', v_total,
    'currency', v_cell.currency,
    'components', v_option_components,
    'orderCostRules', v_order_rules,
    'sources', v_sources,
    'lookupFingerprint', v_fingerprint
  );
end;
$$;

revoke all on function public.is_quote_v2_wholesale_source_authoritative(
  uuid, uuid, text, text, text, text[]
) from public, anon, authenticated;
revoke all on function public.compute_quote_v2_wholesale_version_content_sha256(
  uuid
) from public, anon, authenticated;
grant execute on function public.is_quote_v2_wholesale_source_authoritative(
  uuid, uuid, text, text, text, text[]
) to service_role;
grant execute on function public.compute_quote_v2_wholesale_version_content_sha256(
  uuid
) to service_role;

revoke all on function public.lookup_quote_v2_wholesale_cost(
  text, text, text, text, text, text, numeric, numeric, jsonb, date
) from public, anon, authenticated;
grant execute on function public.lookup_quote_v2_wholesale_cost(
  text, text, text, text, text, text, numeric, numeric, jsonb, date
) to service_role;

alter table public.sales_quote_v2_wholesale_sources enable row level security;
alter table public.sales_quote_v2_wholesale_versions enable row level security;
alter table public.sales_quote_v2_wholesale_version_sources enable row level security;
alter table public.sales_quote_v2_wholesale_programs enable row level security;
alter table public.sales_quote_v2_wholesale_price_cells enable row level security;
alter table public.sales_quote_v2_wholesale_option_components enable row level security;
alter table public.sales_quote_v2_wholesale_order_cost_rules enable row level security;

revoke all on
  public.sales_quote_v2_wholesale_sources,
  public.sales_quote_v2_wholesale_versions,
  public.sales_quote_v2_wholesale_version_sources,
  public.sales_quote_v2_wholesale_programs,
  public.sales_quote_v2_wholesale_price_cells,
  public.sales_quote_v2_wholesale_option_components,
  public.sales_quote_v2_wholesale_order_cost_rules
from public, anon, authenticated;

grant all on
  public.sales_quote_v2_wholesale_sources,
  public.sales_quote_v2_wholesale_versions,
  public.sales_quote_v2_wholesale_version_sources,
  public.sales_quote_v2_wholesale_programs,
  public.sales_quote_v2_wholesale_price_cells,
  public.sales_quote_v2_wholesale_option_components,
  public.sales_quote_v2_wholesale_order_cost_rules
to service_role;

grant usage, select on sequence
  public.sales_quote_v2_wholesale_price_cells_id_seq
to service_role;

comment on table public.sales_quote_v2_wholesale_sources is
  'Pinned manufacturer and authenticated-dealer evidence identities. No customer access.';
comment on table public.sales_quote_v2_wholesale_versions is
  'Review/publish lifecycle for instantly queryable internal wholesale-cost versions.';
comment on table public.sales_quote_v2_wholesale_price_cells is
  'Dimension-indexed manufacturer wholesale grid cells, including explicit unavailable cells.';
comment on function public.lookup_quote_v2_wholesale_cost(
  text, text, text, text, text, text, numeric, numeric, jsonb, date
) is
  'Service-role-only published wholesale lookup with immutable version and source provenance.';
