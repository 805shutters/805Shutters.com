alter table public.crm_job_expenses
  drop constraint if exists crm_job_expenses_category_check;

alter table public.crm_job_expenses
  add constraint crm_job_expenses_category_check check (
    category in (
      'materials',
      'installation_extra',
      'processing_fee',
      'permit',
      'repair',
      'remake',
      'referral',
      'other'
    )
  );
