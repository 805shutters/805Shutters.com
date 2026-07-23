-- Review-only vendor order preparation created from submitted technical measures.
-- This table intentionally has no placed/submitted state.
create table if not exists public.crm_vendor_order_drafts (
  id uuid primary key default gen_random_uuid(),
  technical_measure_form_id uuid not null references public.crm_technical_measure_forms(id) on delete cascade,
  crm_quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  crm_job_id uuid not null references public.crm_jobs(id) on delete cascade,
  manufacturer text not null,
  product_type text not null,
  status text not null default 'needs_input',
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  review_ready_at timestamptz,
  adapter_version text not null,
  source_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  validation_issues jsonb not null default '[]'::jsonb,
  portal_draft_id text,
  screenshot_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_vendor_order_drafts_status_check
    check (status in ('needs_input', 'queued', 'processing', 'review_ready', 'failed', 'cancelled')),
  constraint crm_vendor_order_drafts_review_only_check
    check (status not in ('submitted', 'placed', 'ordered')),
  constraint crm_vendor_order_drafts_source_unique
    unique (technical_measure_form_id, manufacturer, product_type)
);

create index if not exists crm_vendor_order_drafts_status_idx
  on public.crm_vendor_order_drafts (status, requested_at);
create index if not exists crm_vendor_order_drafts_job_idx
  on public.crm_vendor_order_drafts (crm_job_id, requested_at desc);

drop trigger if exists crm_vendor_order_drafts_set_updated_at on public.crm_vendor_order_drafts;
create trigger crm_vendor_order_drafts_set_updated_at
before update on public.crm_vendor_order_drafts
for each row execute function public.set_updated_at();

alter table public.crm_vendor_order_drafts enable row level security;

drop policy if exists "service role can manage vendor order drafts" on public.crm_vendor_order_drafts;
create policy "service role can manage vendor order drafts"
on public.crm_vendor_order_drafts for all to service_role using (true) with check (true);
