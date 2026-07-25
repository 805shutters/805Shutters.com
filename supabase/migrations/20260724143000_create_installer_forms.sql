-- Installer-facing, price-redacted sold-job packet and completion reporting.

create table if not exists public.crm_installer_forms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete set null,
  public_token text not null unique,
  status text not null default 'sent',
  customer_snapshot jsonb not null default '{}'::jsonb,
  line_snapshot jsonb not null default '[]'::jsonb,
  cod_original numeric(12, 2) not null default 0,
  cod_adjusted numeric(12, 2),
  cod_withheld numeric(12, 2) not null default 0,
  issues jsonb not null default '[]'::jsonb,
  accepted boolean not null default false,
  signer_name text,
  signed_at timestamptz,
  sent_at timestamptz,
  email_recipient text,
  email_message_id text,
  email_error text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_installer_forms_status_check
    check (status in ('sent', 'partially_installed', 'completed', 'email_failed'))
);

create unique index if not exists crm_installer_forms_quote_unique
  on public.crm_installer_forms (quote_id);
create index if not exists crm_installer_forms_status_idx
  on public.crm_installer_forms (status, updated_at desc);

drop trigger if exists crm_installer_forms_set_updated_at on public.crm_installer_forms;
create trigger crm_installer_forms_set_updated_at
before update on public.crm_installer_forms
for each row execute function public.set_updated_at();

alter table public.crm_installer_forms enable row level security;
drop policy if exists "service role can manage installer forms" on public.crm_installer_forms;
create policy "service role can manage installer forms"
on public.crm_installer_forms for all to service_role using (true) with check (true);
