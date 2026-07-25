-- Manufacturer catalog sandbox for Quote V2.
-- Draft/test catalog versions may be exercised internally, but only a
-- published version may be attached to an authoritative customer price.

create table if not exists public.sales_quote_v2_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_quote_v2_manufacturers_code_check check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

create table if not exists public.sales_quote_v2_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.sales_quote_v2_manufacturers(id) on delete restrict,
  version text not null,
  lifecycle text not null default 'draft',
  effective_on date,
  catalog_payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_quote_v2_catalog_versions_lifecycle_check check (lifecycle in ('draft', 'testing', 'published', 'retired')),
  constraint sales_quote_v2_catalog_versions_publish_check check ((lifecycle = 'published') = (published_at is not null)),
  constraint sales_quote_v2_catalog_versions_identity_uniq unique (manufacturer_id, version)
);

create table if not exists public.sales_quote_v2_catalog_sandbox_runs (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.sales_quote_v2_catalog_versions(id) on delete cascade,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.sales_quote_v2_price_snapshots
  add column if not exists catalog_version_id uuid references public.sales_quote_v2_catalog_versions(id) on delete restrict;

create or replace function public.enforce_v2_published_catalog_snapshot()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare catalog_lifecycle text;
begin
  if new.catalog_version_id is null then return new; end if;
  select lifecycle into catalog_lifecycle from public.sales_quote_v2_catalog_versions where id = new.catalog_version_id;
  if catalog_lifecycle is distinct from 'published' then
    raise exception 'Only published manufacturer catalog versions may price a customer quote.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_quote_v2_published_catalog_snapshot_trigger on public.sales_quote_v2_price_snapshots;
create trigger sales_quote_v2_published_catalog_snapshot_trigger
before insert or update of catalog_version_id on public.sales_quote_v2_price_snapshots
for each row execute function public.enforce_v2_published_catalog_snapshot();

alter table public.sales_quote_v2_manufacturers enable row level security;
alter table public.sales_quote_v2_catalog_versions enable row level security;
alter table public.sales_quote_v2_catalog_sandbox_runs enable row level security;
revoke all on public.sales_quote_v2_manufacturers, public.sales_quote_v2_catalog_versions, public.sales_quote_v2_catalog_sandbox_runs from anon, authenticated;
grant select on public.sales_quote_v2_manufacturers, public.sales_quote_v2_catalog_versions, public.sales_quote_v2_catalog_sandbox_runs to authenticated;
grant all on public.sales_quote_v2_manufacturers, public.sales_quote_v2_catalog_versions, public.sales_quote_v2_catalog_sandbox_runs to service_role;
