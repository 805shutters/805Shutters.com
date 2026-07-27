alter table public.sales_quotes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists deleted_by_user_id uuid;

create index if not exists sales_quotes_active_account_created_idx
  on public.sales_quotes (account_id, created_at desc)
  where deleted_at is null;

comment on column public.sales_quotes.deleted_at is
  'Soft-delete marker. Quote V2 audit events and price snapshots remain append-only.';
