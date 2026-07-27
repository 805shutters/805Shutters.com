-- Durable manufacturer-separated ordering queue.
-- Orders remain review-gated: "order_confirmed" records evidence supplied after
-- a human-approved manufacturer submission; it does not authorize checkout.

alter table public.crm_vendor_order_drafts
  alter column technical_measure_form_id drop not null;

alter table public.crm_vendor_order_drafts
  add column if not exists source_kind text not null default 'submitted_technical_measure',
  add column if not exists source_id text,
  add column if not exists source_revision text,
  add column if not exists external_task_id text,
  add column if not exists customer_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists quote_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists routing_keys jsonb not null default '[]'::jsonb,
  add column if not exists product_names jsonb not null default '[]'::jsonb,
  add column if not exists line_count integer not null default 1,
  add column if not exists portal_url text,
  add column if not exists order_packet_url text,
  add column if not exists message text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid,
  add column if not exists manufacturer_order_ref text,
  add column if not exists confirmation_url text,
  add column if not exists confirmation_notes text,
  add column if not exists superseded_at timestamptz;

update public.crm_vendor_order_drafts
set
  source_id = coalesce(source_id, technical_measure_form_id::text),
  source_revision = coalesce(source_revision, source_hash),
  external_task_id = coalesce(external_task_id, id::text)
where source_id is null or source_revision is null or external_task_id is null;

alter table public.crm_vendor_order_drafts
  alter column source_id set not null,
  alter column source_revision set not null,
  alter column external_task_id set not null;

alter table public.crm_vendor_order_drafts
  drop constraint if exists crm_vendor_order_drafts_status_check;

alter table public.crm_vendor_order_drafts
  add constraint crm_vendor_order_drafts_status_check
  check (status in (
    'needs_input',
    'queued',
    'processing',
    'review_ready',
    'order_confirmed',
    'failed',
    'cancelled',
    'superseded'
  ));

alter table public.crm_vendor_order_drafts
  drop constraint if exists crm_vendor_order_drafts_review_only_check;

alter table public.crm_vendor_order_drafts
  drop constraint if exists crm_vendor_order_drafts_source_unique;

alter table public.crm_vendor_order_drafts
  add constraint crm_vendor_order_drafts_revision_unique
  unique (crm_quote_id, manufacturer, source_kind, source_revision);

alter table public.crm_vendor_order_drafts
  add constraint crm_vendor_order_drafts_source_kind_check
  check (source_kind in ('signed_contract', 'submitted_technical_measure'));

alter table public.crm_vendor_order_drafts
  add constraint crm_vendor_order_drafts_line_count_check
  check (line_count > 0);

create index if not exists crm_vendor_order_drafts_active_quote_idx
  on public.crm_vendor_order_drafts (crm_quote_id, status, requested_at desc);

create index if not exists crm_vendor_order_drafts_source_idx
  on public.crm_vendor_order_drafts (source_kind, source_id, source_revision);

create unique index if not exists crm_vendor_order_drafts_external_task_idx
  on public.crm_vendor_order_drafts (external_task_id);
